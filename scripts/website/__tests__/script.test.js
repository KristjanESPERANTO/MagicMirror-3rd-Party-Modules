import { after, describe, it } from "node:test";
import { JSDOM } from "jsdom";
import assert from "node:assert/strict";

const { window } = new JSDOM("", { url: "https://example.com/index.html" });
globalThis.window = window;
globalThis.document = window.document;
after(() => window.close());
document.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    event.preventDefault();
  }
});

const pageMarkup = `
  <nav id="nav-menu"><a id="nav-toggler"></a><a id="close-menu"></a></nav>
  <header></header>
  <input id="dark-mode" type="checkbox" />
  <input id="show-outdated" type="checkbox" checked />
  <input id="search-input" />
  <select id="sort-dropdown">
    <option value="default">Default</option>
    <option value="stars">Stars</option>
    <option value="name">Name</option>
  </select>
  <select id="category-filter"><option value="all">All</option></select>
  <div id="tag-buttons"></div>
  <button id="reset-button"></button>
  <div id="module-count-value"></div>
  <div id="last-update"></div>
  <main id="module-container"></main>
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
document.body.innerHTML = pageMarkup;

const modules = [
  {
    name: "MMM-Alpha",
    maintainer: "Alice",
    url: "https://example.com/alpha",
    description: "Weather module",
    category: "weather",
    tags: ["weather"],
    image: "alpha.png",
    stars: 5,
    lastCommit: "2026-01-01T00:00:00.000Z",
    defaultSortWeight: 1
  },
  {
    name: "MMM-Beta",
    maintainer: "Bob",
    url: "https://example.com/beta",
    description: "Calendar module",
    category: "calendar",
    tags: ["calendar"],
    stars: 10,
    lastCommit: "2026-02-01T00:00:00.000Z",
    defaultSortWeight: 2
  }
];

const skippedModules = [{ name: "MMM-Skipped", error: "Load failed" }];
const requestedFiles = [];
const modulesResponse = Promise.withResolvers();
const statisticsResponse = Promise.withResolvers();
globalThis.fetch = (url) => {
  requestedFiles.push(url);
  const responses = {
    "data/modules.min.json": { modules },
    "data/skipped_modules.json": skippedModules,
    "data/stats.json": { lastUpdate: "2026-03-01T00:00:00.000Z" }
  };
  const response = { ok: true, json: () => Promise.resolve(responses[url]) };
  if (url === "data/stats.json") {
    return statisticsResponse.promise.then(() => response);
  }
  return url === "data/modules.min.json"
    ? modulesResponse.promise.then(() => response)
    : Promise.resolve(response);
};

await import("../../../website/script.js");
const initialRequests = [...requestedFiles];
modulesResponse.resolve();
await new Promise((resolve) => {
  setTimeout(resolve, 0);
});

function cardNames() {
  return [...document.querySelectorAll("#module-container .name")]
    .map(card => card.textContent);
}

let catalogueInstance = 0;
async function initializeCatalogue(context, fetchResponse, url = "/index.html") {
  document.body.innerHTML = pageMarkup;
  window.history.replaceState({}, "", url);
  context.mock.method(globalThis, "fetch", fetchResponse);
  catalogueInstance += 1;
  await import(`../../../website/script.js?instance=${catalogueInstance}`);
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("website module catalogue", () => {
  it("starts all data requests before the modules request finishes", () => {
    assert.deepEqual(initialRequests, [
      "data/modules.min.json",
      "data/skipped_modules.json",
      "data/stats.json"
    ]);
  });

  it("loads modules and renders categories", () => {
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
    assert.ok(document.querySelector("#category-filter option[value=weather]"));
    assert.equal(document.getElementById("module-count-value").textContent, "3 of 3");
  });

  it("renders the catalogue without waiting for statistics", async () => {
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
    assert.equal(document.getElementById("last-update").textContent, "");

    statisticsResponse.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    assert.match(document.getElementById("last-update").textContent, /^Last Update: /u);
  });

  it("sorts modules by stars", () => {
    const initialCards = [...document.querySelectorAll("#module-container .card")];
    const sortDropdown = document.getElementById("sort-dropdown");
    sortDropdown.value = "stars";
    sortDropdown.dispatchEvent(new window.Event("change"));

    assert.deepEqual(cardNames(), ["MMM-Beta", "MMM-Alpha", "MMM-Skipped"]);
    const sortedCards = [...document.querySelectorAll("#module-container .card")];
    assert.ok(sortedCards[0] === initialCards[1]);
    assert.ok(sortedCards[1] === initialCards[0]);
    assert.ok(sortedCards[2] === initialCards[2]);
  });

  it("filters by category and resets the catalogue", () => {
    const initialCards = [...document.querySelectorAll("#module-container .card")];
    const categoryFilter = document.getElementById("category-filter");
    categoryFilter.value = "weather";
    categoryFilter.dispatchEvent(new window.Event("change"));
    assert.deepEqual(cardNames(), ["MMM-Alpha"]);

    document.getElementById("reset-button").click();
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
    const resetCards = [...document.querySelectorAll("#module-container .card")];
    assert.ok(resetCards[0] === initialCards[1]);
    assert.ok(resetCards[1] === initialCards[0]);
    assert.ok(resetCards[2] === initialCards[2]);
  });

  it("keeps the outdated filter and URL synchronized when toggled and reset", () => {
    window.history.replaceState({}, "", "/index.html?keep=value#modules");
    const showOutdated = document.getElementById("show-outdated");
    showOutdated.checked = false;
    showOutdated.dispatchEvent(new window.Event("change"));

    assert.equal(new URLSearchParams(window.location.search).get("showOutdated"), "false");
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta"]);

    document.getElementById("reset-button").click();

    assert.equal(showOutdated.checked, true);
    assert.equal(new URLSearchParams(window.location.search).get("showOutdated"), "true");
    assert.equal(new URLSearchParams(window.location.search).get("keep"), "value");
    assert.equal(window.location.hash, "#modules");
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
  });

  it("reuses cards after searching", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const initialCards = [...document.querySelectorAll("#module-container .card")];
    const searchInput = document.getElementById("search-input");
    searchInput.value = "calendar";
    searchInput.dispatchEvent(new window.Event("input"));
    context.mock.timers.tick(180);

    assert.deepEqual(cardNames(), ["MMM-Beta"]);
    assert.ok(document.querySelector("#module-container .card") === initialCards[1]);

    searchInput.value = "";
    searchInput.dispatchEvent(new window.Event("input"));
    context.mock.timers.tick(180);

    const restoredCards = [...document.querySelectorAll("#module-container .card")];
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
    assert.ok(restoredCards.every((card, index) => card === initialCards[index]));
  });

  it("retains card callbacks and clears selection on reused cards", () => {
    const card = document.querySelector("#module-container .card");
    card.click();
    assert.ok(card.classList.contains("selected"));

    const sortDropdown = document.getElementById("sort-dropdown");
    sortDropdown.dispatchEvent(new window.Event("change"));
    assert.equal(card.classList.contains("selected"), false);

    card.querySelector("[data-tag=weather]").click();
    assert.deepEqual(cardNames(), ["MMM-Alpha"]);
    assert.ok(card.querySelector("[data-tag=weather]").classList.contains("selected"));

    document.getElementById("reset-button").click();
    assert.equal(card.querySelector("[data-tag=weather]").classList.contains("selected"), false);

    card.querySelector(".maintainer").click();
    assert.deepEqual(cardNames(), ["MMM-Alpha"]);
    assert.ok(document.querySelector("#module-container .card") === card);
    document.getElementById("reset-button").click();
  });

  it("keeps image overlays attached to their reused card", () => {
    const card = document.querySelector("#module-container .card");
    const image = card.querySelector(".img-container img");
    const overlay = image.nextElementSibling;
    image.click();
    assert.ok(overlay.parentElement === document.body);
    assert.equal(overlay.style.display, "flex");

    const categoryFilter = document.getElementById("category-filter");
    categoryFilter.value = "calendar";
    categoryFilter.dispatchEvent(new window.Event("change"));
    assert.equal(card.isConnected, false);

    overlay.click();
    assert.equal(overlay.style.display, "none");
    assert.ok(overlay.parentElement === image.parentElement);

    document.getElementById("reset-button").click();
    assert.ok(document.querySelector("#module-container .card") === card);
    image.click();
    assert.equal(overlay.style.display, "flex");
    overlay.click();
    assert.equal(document.querySelector("body > .overlay"), null);
  });
});

describe("website search debounce", () => {
  for (const filter of ["category", "tag", "maintainer", "reset"]) {
    it(`does not let a pending search override ${filter}`, (context) => {
      context.mock.timers.enable({ apis: ["setTimeout"] });
      document.getElementById("reset-button").click();
      const searchInput = document.getElementById("search-input");
      searchInput.value = "calendar";
      searchInput.dispatchEvent(new window.Event("input"));

      if (filter === "category") {
        const categoryFilter = document.getElementById("category-filter");
        categoryFilter.value = "weather";
        categoryFilter.dispatchEvent(new window.Event("change"));
      }
      else if (filter === "tag") {
        document.querySelector("#tag-buttons [data-tag=weather]").click();
      }
      else if (filter === "maintainer") {
        document.querySelector("#module-container .maintainer").click();
      }
      else {
        document.getElementById("reset-button").click();
      }

      const expectedNames = cardNames();
      context.mock.timers.tick(180);
      assert.deepEqual(cardNames(), expectedNames);
      document.getElementById("reset-button").click();
    });
  }

  it("only applies the latest search after the debounce interval", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const searchInput = document.getElementById("search-input");
    searchInput.value = "weather";
    searchInput.dispatchEvent(new window.Event("input"));
    context.mock.timers.tick(100);
    searchInput.value = "calendar";
    searchInput.dispatchEvent(new window.Event("input"));
    context.mock.timers.tick(179);
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
    context.mock.timers.tick(1);
    assert.deepEqual(cardNames(), ["MMM-Beta"]);
    document.getElementById("reset-button").click();
  });
});

describe("website outdated modules", () => {
  it("honors the initial URL and reuses outdated cards after toggling", async (context) => {
    const outdatedModule = {
      ...modules[0],
      name: "MMM-Legacy",
      outdated: "No longer maintained",
      defaultSortWeight: 999,
      issues: true
    };
    const responses = {
      "data/modules.min.json": { modules: [...modules, outdatedModule] },
      "data/skipped_modules.json": skippedModules,
      "data/stats.json": { lastUpdate: "2026-03-01T00:00:00.000Z" }
    };
    await initializeCatalogue(context, url => Promise.resolve(new Response(JSON.stringify(responses[url]))), "/index.html?showOutdated=false&keep=value#modules");

    const showOutdated = document.getElementById("show-outdated");
    assert.equal(showOutdated.checked, false);
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta"]);
    assert.equal(document.getElementById("module-count-value").textContent, "2 of 3");

    showOutdated.checked = true;
    showOutdated.dispatchEvent(new window.Event("change"));
    const outdatedCard = document.querySelector("#module-container .outdated");
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Legacy", "MMM-Skipped"]);
    assert.equal(document.getElementById("module-count-value").textContent, "4 of 4");
    assert.equal(outdatedCard.querySelector(".outdated-note").textContent, "No longer maintained");
    assert.equal(outdatedCard.querySelector(".container.issues"), null);

    showOutdated.checked = false;
    showOutdated.dispatchEvent(new window.Event("change"));
    assert.equal(outdatedCard.isConnected, false);
    showOutdated.checked = true;
    showOutdated.dispatchEvent(new window.Event("change"));
    assert.ok(document.querySelector("#module-container .outdated") === outdatedCard);
    assert.equal(new URLSearchParams(window.location.search).get("keep"), "value");
    assert.equal(window.location.hash, "#modules");
  });
});

describe("website initialization failures", () => {
  const responses = {
    "data/modules.min.json": { modules },
    "data/skipped_modules.json": skippedModules,
    "data/stats.json": { lastUpdate: "2026-03-01T00:00:00.000Z" }
  };

  for (const failure of ["network", "json", "http"]) {
    for (const failedFile of Object.keys(responses)) {
      it(`continues loading after a ${failure} failure in ${failedFile}`, async (context) => {
        const errors = context.mock.method(console, "error", () => null);
        await initializeCatalogue(context, (url) => {
          if (url === failedFile && failure === "network") {
            return Promise.reject(new Error("Request failed"));
          }
          const body = url === failedFile && failure === "json" ? "{" : JSON.stringify(responses[url]);
          const status = url === failedFile && failure === "http" ? 503 : 200;
          return Promise.resolve(new Response(body, { status }));
        });

        const expectedNames = [];
        if (failedFile !== "data/modules.min.json") {
          expectedNames.push("MMM-Alpha", "MMM-Beta");
        }
        if (failedFile !== "data/skipped_modules.json") {
          expectedNames.push("MMM-Skipped");
        }
        assert.deepEqual(cardNames(), expectedNames);
        assert.equal(errors.mock.callCount(), failedFile === "data/skipped_modules.json" ? 0 : 1);
        assert.equal(document.getElementById("last-update").textContent === "", failedFile === "data/stats.json");
      });
    }
  }

  for (const statisticsFail of [false, true]) {
    it(`renders an empty catalogue when catalogue requests fail and statistics ${statisticsFail ? "fail" : "succeed"}`, async (context) => {
      const errors = context.mock.method(console, "error", () => null);
      await initializeCatalogue(context, (url) => {
        if (url !== "data/stats.json" || statisticsFail) {
          return Promise.reject(new Error("Request failed"));
        }
        return Promise.resolve(new Response(JSON.stringify(responses[url])));
      });
      assert.deepEqual(cardNames(), []);
      assert.equal(document.getElementById("module-count-value").textContent, "0 of 0");
      assert.equal(document.getElementById("reset-button").style.display, "none");
      assert.equal(errors.mock.callCount(), statisticsFail ? 2 : 1);
      assert.equal(document.getElementById("last-update").textContent === "", statisticsFail);
    });
  }
});
