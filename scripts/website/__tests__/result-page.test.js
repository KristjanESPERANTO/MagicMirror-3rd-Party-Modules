import { describe, it } from "node:test";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageHtml = readFileSync(new URL("../../../website/result.html", import.meta.url), "utf8");
const markdown = `# Module analysis

## General notes

Shared notes for developers.

## Statistics

Two modules.

## Modules with issues

### [MMM-Alpha by Alice & Bob/Team](https://example.com/alpha)

1. **Alpha finding**

### [MMM-Beta by Bob](https://example.com/beta)

1. Beta finding
`;

let reportInstance = 0;
async function loadReport(context, { search = "", hash = "", content = markdown, failure = "" } = {}) {
  const { window } = new JSDOM(pageHtml, { url: `https://example.com/result.html${search}${hash}` });
  globalThis.window = window;
  globalThis.document = window.document;
  context.after(() => window.close());
  const scrollIntoView = context.mock.fn(() => null);
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  const errors = context.mock.method(console, "error", () => null);
  const fetchMock = context.mock.method(globalThis, "fetch", () => {
    if (failure === "network") {
      return Promise.reject(new Error("Network unavailable"));
    }
    if (failure === "body") {
      return Promise.resolve({ ok: true, text: () => Promise.reject(new Error("Body unavailable")) });
    }
    return Promise.resolve(new Response(content, { status: failure === "http" ? 503 : 200 }));
  });
  reportInstance += 1;
  await import(`../../../website/result-page.js?instance=${reportInstance}`);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
  assert.deepEqual(fetchMock.mock.calls.map(call => call.arguments), [["result.md"]]);
  return { document: window.document, errors, scrollIntoView };
}

describe("website result page", () => {
  it("renders the full report without a redundant full-list link", async (context) => {
    const { document, errors } = await loadReport(context);
    const content = document.getElementById("markdown-container");

    assert.ok(content.textContent.includes("Alpha finding"));
    assert.ok(content.textContent.includes("Beta finding"));
    assert.equal(content.querySelectorAll("h3").length, 2);
    assert.equal(document.getElementById("full-results-link"), null);
    assert.equal(document.getElementById("show-outdated-findings"), null);
    assert.equal(errors.mock.callCount(), 0);
  });

  for (const headingStyle of ["linked", "plain"]) {
    it(`renders only the requested module from ${headingStyle} headings`, async (context) => {
      const content = headingStyle === "plain"
        ? markdown.replace("[MMM-Alpha by Alice & Bob/Team](https://example.com/alpha)", "MMM-Alpha by Alice & Bob/Team")
        : markdown;
      const { document, errors } = await loadReport(context, {
        search: "?module=MMM-Alpha-by-Alice--BobTeam",
        content
      });
      const report = document.getElementById("markdown-container");

      assert.equal(document.title, "MMM-Alpha by Alice & Bob/Team · Module hints");
      assert.ok(report.textContent.includes("Shared notes for developers."));
      assert.ok(report.textContent.includes("Alpha finding"));
      assert.equal(report.textContent.includes("Beta finding"), false);
      assert.equal(report.textContent.includes("Two modules."), false);
      assert.equal(report.querySelector("strong").textContent, "Alpha finding");
      assert.equal(document.getElementById("full-results-link").getAttribute("href"), "result.html");
      assert.equal(errors.mock.callCount(), 0);
    });
  }

  it("renders the last module even when general notes are absent", async (context) => {
    const { document } = await loadReport(context, {
      search: "?module=MMM-Beta-by-Bob",
      content: markdown.replace("## General notes\n\nShared notes for developers.\n\n", "")
    });
    const content = document.getElementById("markdown-container");
    assert.ok(content.textContent.includes("Beta finding"));
    assert.equal(content.textContent.includes("Alpha finding"), false);
    assert.equal(content.textContent.includes("General notes"), false);
  });

  it("shows a useful empty state for an unknown module", async (context) => {
    const { document, errors } = await loadReport(context, { search: "?module=Missing" });
    assert.equal(document.getElementById("markdown-container").textContent, "No hints found for this module.");
    assert.ok(document.getElementById("full-results-link"));
    assert.equal(errors.mock.callCount(), 0);
  });

  for (const failure of ["network", "http", "body"]) {
    it(`shows a load error after a ${failure} failure`, async (context) => {
      const { document, errors } = await loadReport(context, { failure });
      assert.equal(document.getElementById("markdown-container").textContent, "Error loading markdown content.");
      assert.equal(errors.mock.callCount(), 1);
    });
  }

  it("creates matching anchors and scrolls to an encoded heading", async (context) => {
    const { document, scrollIntoView } = await loadReport(context, { hash: "#MMM-Alpha-by-Alice-%2DBobTeam" });
    const anchor = document.getElementById("MMM-Alpha-by-Alice--BobTeam");
    assert.ok(anchor);
    assert.equal(anchor.getAttribute("href"), "#MMM-Alpha-by-Alice--BobTeam");
    assert.equal(scrollIntoView.mock.callCount(), 1);
    assert.ok(scrollIntoView.mock.calls[0].this === anchor);
  });

  it("ignores a nonexistent anchor without losing the report", async (context) => {
    const { document, scrollIntoView, errors } = await loadReport(context, { hash: "#missing" });
    assert.ok(document.getElementById("markdown-container").textContent.includes("Alpha finding"));
    assert.equal(scrollIntoView.mock.callCount(), 0);
    assert.equal(errors.mock.callCount(), 0);
  });

  it("removes executable HTML while preserving safe report content", async (context) => {
    const { document } = await loadReport(context, {
      content: `${markdown}\n<img src="x" onerror="alert(1)"><script>alert(1)</script>\n\n[Unsafe](javascript:alert(1)) [Docs](https://example.com/docs)`
    });
    const content = document.getElementById("markdown-container");
    assert.equal(content.querySelector("script, [onerror], a[href^='javascript:']"), null);
    assert.equal(content.querySelector("strong").textContent, "Alpha finding");
    assert.ok(content.querySelector("a[href='https://example.com/docs']"));
  });
});
