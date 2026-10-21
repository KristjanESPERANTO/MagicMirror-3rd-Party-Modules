import { after, describe, it, mock } from "node:test";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";

const { window } = new JSDOM();
globalThis.window = window;
globalThis.document = window.document;
after(() => window.close());

document.body.innerHTML = `
  <template id="card-template">
    <article class="card">
      <a class="name"></a>
      <div class="description"></div>
      <div class="maintainer"></div>
      <div class="stars"></div>
      <div class="tags"></div>
      <div class="img-container"><img /><div class="overlay"><img /></div></div>
      <div class="info">
        <div class="container issues"><a class="text"></a></div>
        <div class="container commit"><a class="text"></a></div>
        <div class="container license"><a class="text"></a></div>
      </div>
      <div class="outdated-note"></div>
    </article>
  </template>
`;

const { createCard } = await import("../../../website/card.js");

const callbacks = {
  filterByMaintainer: mock.fn(),
  filterByTag: mock.fn()
};

describe("createCard", () => {
  it("renders Markdown descriptions with local marked", () => {
    const card = createCard({
      name: "Test module",
      maintainer: "Test maintainer",
      url: "https://example.com",
      description: "Weather with **forecast** and [Docs](https://example.com/docs)"
    }, callbacks);
    const description = card.querySelector(".description");
    const link = description.querySelector("a");

    assert.equal(description.querySelector("strong").textContent, "forecast");
    assert.equal(link.href, "https://example.com/docs");
    assert.equal(link.target, "_blank");
    assert.equal(link.rel, "noopener noreferrer");
  });

  it("renders skipped-module errors as text", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const card = createCard({ skipped: true, error: payload }, callbacks);
    const description = card.querySelector(".description");

    assert.equal(description.querySelector("img"), null);
    assert.ok(description.textContent.includes(payload));
  });

  it("removes executable HTML while preserving safe Markdown", () => {
    const card = createCard({
      name: "Test module",
      maintainer: "Test maintainer",
      url: "https://example.com",
      description: "**Weather** <img src=\"x\" onerror=\"alert(1)\"> <script>alert(1)</script> [Unsafe](javascript:alert(1)) [Docs](https://example.com/docs)"
    }, callbacks);
    const description = card.querySelector(".description");

    assert.equal(description.querySelector("strong").textContent, "Weather");
    assert.equal(description.querySelector("script, [onerror], a[href^='javascript:']"), null);
    assert.equal(description.querySelector("a[href='https://example.com/docs']").rel, "noopener noreferrer");
  });

  it("renders the outdated note safely", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const card = createCard({
      name: "Test module",
      maintainer: "Test maintainer",
      url: "https://example.com",
      outdated: payload
    }, callbacks);
    const notice = card.querySelector(".outdated-note");

    assert.equal(notice.querySelector("img"), null);
    assert.equal(notice.textContent, payload);
    assert.equal(card.querySelector(".container.issues"), null);
  });
});
