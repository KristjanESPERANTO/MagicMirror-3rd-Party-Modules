let allModules = [];
let skippedModules = [];
let filteredModuleList = [];
const cardTemplate = document.getElementById("card-template");
const resetButton = document.getElementById("reset-button");
const moduleCardContainer = document.getElementById("module-container");
const searchInput = document.getElementById("search-input");
const tagButtonContainer = document.getElementById("tag-buttons");
const sortDropdown = document.getElementById("sort-dropdown");
const showOutdated = document.getElementById("show-outdated");
const darkMode = document.getElementById("dark-mode");

const tagsList = [
  "calendar",
  "media",
  "motion detection",
  "news",
  "public transport",
  "smart home",
  "sports",
  "stock",
  "text-to-speech",
  "traffic",
  "voice control",
  "weather"
];


function toggleMenu () {
  const navMenu = document.getElementById("nav-menu");
  navMenu.classList.toggle("visible");
}

function createCard (moduleData) {
  const card = document.importNode(cardTemplate.content, true);

  // Skipped module special handling
  if (moduleData.skipped) {
    card.querySelector(".card").classList.add("skipped");
    card.querySelector(".name").textContent = moduleData.name || "Unknown Module";
    card.querySelector(".name").href = moduleData.url || "#";
    card.querySelector(".description").innerHTML = `<span style='color:red;font-weight:bold'>Error: Module could not be loaded.</span><br>${moduleData.error || "Unknown Error"}`;
    // Remove other info sections
    card.querySelector(".maintainer").textContent = moduleData.maintainer || "?";
    [".stars", ".tags", ".img-container", ".info", ".outdated-note"].forEach((selector) => {
      const element = card.querySelector(selector);
      if (element) {
        element.remove();
      }
    });
    return card;
  }

  /* Set the header data */
  card.querySelector(".name").href = moduleData.url;
  card.querySelector(".name").textContent = moduleData.name;

  const maintainerContainer = card.querySelector(".maintainer");
  maintainerContainer.textContent = `${moduleData.maintainer}`;
  maintainerContainer.addEventListener("click", () => {
    filterByMaintainer(moduleData.maintainer);
  });

  if (typeof moduleData.stars === "undefined") {
    card.querySelector(".stars").remove();
  } else {
    card.querySelector(".stars").textContent = `${moduleData.stars} stars`;
  }

  /* Generate the tags, add color asignation */
  if (moduleData.tags) {
    moduleData.tags.forEach((tag) => {
      const tagElement = document.createElement("div");
      tagElement.setAttribute("data-tag", tag);
      tagElement.textContent = tag;

      tagElement.addEventListener("click", () => {
        filterByTag(tag);
      });

      card.querySelector(".tags").appendChild(tagElement);
    });
  } else {
    card.querySelector(".tags").remove();
  }

  /* Set the card body */
  card.querySelector(".description").innerHTML = moduleData.description;

  if (moduleData.image) {
    const imagePath = `./images/${moduleData.name}---${moduleData.maintainer}---${moduleData.image}`;
    const image = card.querySelector(".img-container img");
    image.src = imagePath;
    image.alt = `${moduleData.name} image`;

    const overlay = image.nextElementSibling;
    image.onclick = () => {
      overlay.style.display = "block";
      overlay.getElementsByTagName("img")[0].src = image.src;
    };

    overlay.onclick = () => {
      overlay.style.display = "none";
    };
  } else {
    card.querySelector(".img-container").remove();
  }

  const license = card.querySelector(".info .container.license .text");
  license.href = `${moduleData.url}`;
  if (moduleData.license) {
    license.textContent = `©${moduleData.license}`;
  } else {
    license.style.color = "red";
    license.textContent = "unknown";
  }

  /* Set the card footer */
  if (moduleData.lastCommit) {
    const commit = card.querySelector(".info .container.commit .text");
    commit.href = `${moduleData.url}/commits/`;
    commit.textContent = `${moduleData.lastCommit.split("T")[0]}`;
  } else {
    card.querySelector(".info .container.commit").remove();
  }


  if (moduleData.issues) {
    const url = `result.html#${moduleData.name}-by-${moduleData.maintainer}`;
    card.querySelector(".info .container.issues .text").href = url;
  } else {
    card.querySelector(".info .container.issues").remove();
  }

  /* Add a notice/change styling if the module is outdated */
  if (moduleData.outdated) {
    card.querySelector(".card").classList.add("outdated");
    card.querySelector(".outdated-note").innerHTML = moduleData.outdated;
  } else {
    card.querySelector(".outdated-note").remove();
  }

  return card;
}

function updateModuleCardContainer () {
  moduleCardContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  let moduleCounter = filteredModuleList.length;

  filteredModuleList.forEach((moduleData) => {
    if ((!moduleData.outdated || showOutdated.checked) && (!moduleData.skipped || showOutdated.checked)) {
      try {
        const cardNode = createCard(moduleData);
        if (cardNode) {
          fragment.appendChild(cardNode);
        }
      } catch (error) {
        console.error("Error creating module", moduleData, error);
      }
    } else {
      moduleCounter -= 1;
    }
  });

  // Single DOM insertion to minimize reflows/layout thrash
  moduleCardContainer.appendChild(fragment);

  const moduleCountElement = document.getElementById("module-count-value");
  moduleCountElement.textContent = `${moduleCounter} of ${allModules.length}`;

  if (moduleCounter === allModules.length) {
    resetButton.style.display = "none";
  } else {
    resetButton.style.display = "block";
  }

  const navMenu = document.getElementById("nav-menu");
  if (navMenu.classList.contains("visible")) {
    toggleMenu();
  }
}

function sortData (sortOption) {
  switch (sortOption) {
    case "lastcommit":
      filteredModuleList.sort((a, b) =>
        b.lastCommit.localeCompare(a.lastCommit));
      break;
    case "stars":
      filteredModuleList.sort((a, b) => {
        const starsA = a.stars || 0;
        const starsB = b.stars || 0;
        return starsB - starsA;
      });
      break;
    case "name":
      filteredModuleList.sort((a, b) => {
        const nameA = a.name.replace("MMM-", "");
        const nameB = b.name.replace("MMM-", "");
        return nameA.localeCompare(nameB);
      });
      break;
    default:
      filteredModuleList.sort((a, b) =>
        // Sort by defaultSortWeight (outdated at the end, rest by issue count)
        a.defaultSortWeight - b.defaultSortWeight ||
        // Sort by last commit date
        b.lastCommit.localeCompare(a.lastCommit));
  }
}

function displayTagButtonContainer () {
  tagButtonContainer.innerHTML = "";

  tagsList.forEach((tag) => {
    const button = document.createElement("a");
    button.className = "tag-button";
    button.textContent = tag;
    button.setAttribute("data-tag", tag);

    button.addEventListener("click", () => {
      filterByTag(tag);
      resetCategoryFilter();
    });
    tagButtonContainer.appendChild(button);
  });
}

function resetCategoryFilter () {
  const categoryFilter = document.getElementById("category-filter");
  categoryFilter.value = "all";
}

function removeSelectedMarkingFromTagsAndCards () {
  // Remove the "selected" class from all tag buttons and cards
  const allURLs = document.querySelectorAll(".tag-button, .card");
  allURLs.forEach((url) => url.classList.remove("selected"));
}

function displayStatistics (data) {
  const lastUpdateDate = new Date(data.lastUpdate).toLocaleString();
  const lastUpdateDiv = document.getElementById("last-update");
  lastUpdateDiv.innerHTML = `Last Update: ${lastUpdateDate}`;
}

function filterBySearchText (searchText) {
  const searchLower = searchText.toLowerCase();
  const allModulesList = allModules.concat(skippedModules);
  filteredModuleList = allModulesList.filter((card) => {
    const cardText = card.text
      ? card.text.toLowerCase()
      : "";
    const cardDescription = card.description
      ? card.description.toLowerCase()
      : "";
    const cardName = card.name
      ? card.name.toLowerCase()
      : "";
    const cardMaintainer = card.maintainer
      ? card.maintainer.toLowerCase()
      : "";
    const cardTags = card.tags
      ? card.tags
      : [];

    return (
      cardText.includes(searchLower) ||
      cardDescription.includes(searchLower) ||
      cardName.includes(searchLower) ||
      cardMaintainer.includes(searchLower) ||
      cardTags.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  });

  removeSelectedMarkingFromTagsAndCards();

  updateModuleCardContainer();
}

function filterByMaintainer (maintainer) {
  filteredModuleList = allModules.filter((card) => card.maintainer === maintainer);

  searchInput.value = "";

  removeSelectedMarkingFromTagsAndCards();

  updateModuleCardContainer();
}

function filterByTag (tag) {
  filteredModuleList = allModules.filter((card) => {
    const tags = card.tags;
    if (tags) {
      return tags.includes(tag);
    }
    return false;
  });

  searchInput.value = "";

  removeSelectedMarkingFromTagsAndCards();

  updateModuleCardContainer();

  // Mark the selected tag container
  const selectedTagContainers = document.querySelectorAll(`[data-tag="${tag}"]`);
  selectedTagContainers.forEach((container) => {
    container.classList.add("selected");
  });
}

function addCategoryFilter () {
  const categoryFilter = document.getElementById("category-filter");
  const categories = [...new Set(allModules.map((module) => module.category))];
  categories.sort();
  categories.push("Problematic Modules");

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });

  categoryFilter.addEventListener("change", () => {
    const selectedCategory = categoryFilter.value;
    if (selectedCategory === "all") {
      filteredModuleList = allModules.concat(skippedModules);
    } else if (selectedCategory === "Problematic Modules") {
      filteredModuleList = skippedModules;
    } else {
      filteredModuleList = allModules.filter((module) => module.category === selectedCategory);
    }

    searchInput.value = "";
    removeSelectedMarkingFromTagsAndCards();
    updateModuleCardContainer();
  });
}

// Add an event listener for clicks on the cards
moduleCardContainer.addEventListener("click", (event) => {
  // Check if the clicked element is a card
  const clickedCard = event.target.closest(".card");
  if (clickedCard) {
    // Remove the "selected" class from all cards
    const allCards = document.querySelectorAll(".card");
    allCards.forEach((card) => card.classList.remove("selected"));

    // Mark the selected card
    clickedCard.classList.add("selected");
  }
});

resetButton.addEventListener("click", () => {
  resetCategoryFilter();
  const root = document.querySelector(":root");
  filteredModuleList = allModules.concat(skippedModules);
  searchInput.value = "";
  showOutdated.checked = true;
  removeSelectedMarkingFromTagsAndCards();
  sortDropdown.value = "default";
  sortData(sortDropdown.value);
  root.style.setProperty("--color-accent-header", "var(--color-background)");
  root.style.setProperty("--color-accent-light", "#ebf8ff");
  root.style.setProperty("--color-accent-dark", "#033454");
  updateModuleCardContainer();
});

// Debounce search input to avoid excessive filtering on each keystroke
let searchDebounceTimer = null;
searchInput.addEventListener("input", () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    if (searchInput.value) {
      filterBySearchText(searchInput.value);
    } else {
      filteredModuleList = allModules.concat(skippedModules);
      updateModuleCardContainer();
    }
  }, 180);
});

// Add a change event listener to the dropdown menu
sortDropdown.addEventListener("change", () => {
  sortData(sortDropdown.value);
  updateModuleCardContainer();
});

showOutdated.addEventListener("change", () => {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set("showOutdated", showOutdated.checked);
  window.history.replaceState({}, "", `${window.location.pathname}?${urlParams}`);
  updateModuleCardContainer();
});

// Add Event-Listener to close the navMenu when clicking outside of it
document.addEventListener("click", (event) => {
  const navMenu = document.getElementById("nav-menu");
  const navToggler = document.getElementById("nav-toggler");
  if (navMenu.classList.contains("visible")) {
    if (!navMenu.contains(event.target) && !navToggler.contains(event.target)) {
      toggleMenu();
    }
  }
});

// Add Event-Listener to close the navMenu when clicking on a link
const navLinks = document.querySelectorAll("#nav-menu a");
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const navMenu = document.getElementById("nav-menu");
    if (navMenu.classList.contains("visible")) {
      toggleMenu();
    }
  });
});

async function initiate () {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("showOutdated")) {
    const showOutdatedParam = urlParams.get("showOutdated");
    showOutdated.checked = showOutdatedParam === "true";
  }

  const modulesFile = "data/modules.min.json";
  try {
    const response = await fetch(modulesFile);
    const data = await response.json();
    allModules = data;
  } catch (error) {
    allModules = [];
    console.error("Error fetching modules:", error);
  }

  // Load skipped modules
  try {
    const skippedRes = await fetch("data/skipped_modules.json");
    const skippedRaw = await skippedRes.json();
    skippedModules = skippedRaw.map((moduleObj) => ({...moduleObj, skipped: true, defaultSortWeight: 1000, lastCommit: ""}));
  } catch {
    skippedModules = [];
  }

  filteredModuleList = allModules.concat(skippedModules);
  sortData(sortDropdown.value);
  updateModuleCardContainer();
  displayTagButtonContainer();
  addCategoryFilter();

  // Load statistics
  const statisticsFile = "data/stats.json";
  try {
    const response = await fetch(statisticsFile);
    const data = await response.json();
    displayStatistics(data);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// eslint-disable-next-line no-unused-vars
function switchDarkMode () {
  const header = document.getElementsByTagName("header")[0];
  const body = document.getElementsByTagName("body")[0];
  const root = document.querySelector(":root");
  const sortButton = document.getElementById("sort-dropdown");
  if (darkMode.checked) {
    header.style.backgroundColor = "#222";
    header.style.color = "#e9e9e9";
    body.style.backgroundColor = "#222";
    sortButton.style.color = "#ddd";
    sortButton.style.backgroundColor = "#555";
    resetButton.style.color = "#ddd";
    resetButton.style.backgroundColor = "#555";
    root.style.setProperty("--color-card-background", "#ddd");
  } else {
    header.style.backgroundColor = "#e9e9e9";
    header.style.color = "#222";
    body.style.backgroundColor = "#e9e9e9";
    sortButton.style.color = "#555";
    sortButton.style.backgroundColor = "#ddd";
    resetButton.style.color = "#555";
    resetButton.style.backgroundColor = "#ddd";
    root.style.setProperty("--color-card-background", "#fff");
  }

  const navMenu = document.getElementById("nav-menu");
  if (navMenu.classList.contains("visible")) {
    toggleMenu();
  }
}

initiate();
