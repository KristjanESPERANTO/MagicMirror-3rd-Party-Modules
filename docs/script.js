let allModules = [];
let filteredModuleList = [];
const resetButton = document.getElementById("reset-button");
const moduleCardContainer = document.getElementById("module-container");
const searchInput = document.getElementById("search-input");
const tagButtonContainer = document.getElementById("tag-buttons");
const sortDropdown = document.getElementById("sort-dropdown");
const showOutdated = document.getElementById("show-outdated");

function updateModuleCardContainer () {
  moduleCardContainer.innerHTML = "";

  let moduleCounter = filteredModuleList.length;

  filteredModuleList.forEach((moduleData) => {
    if (!moduleData.outdated || showOutdated.checked) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
              <div class="card-header">
                <a href="${moduleData.url}" target="_blank">${moduleData.name}</a>
                <div class="maintainer">maintained by ${moduleData.maintainer}</div>
                <div class="last-commit">last commit: ${moduleData.last_commit}</div>
              </div>
            `;
      if (moduleData.issues > 0) {
        const url = `https://github.com/KristjanESPERANTO/MagicMirror-3rd-Party-Modules/blob/main/result.md#${moduleData.name}-by-${moduleData.maintainer}`;
        card.innerHTML += `<div class="issues"><a target="_blank" href="${url}">🗈</a></div>`;
      }

      if (moduleData.image) {
        const imagePath = `./images/${moduleData.name}---${moduleData.maintainer}---${moduleData.image}`;
        card.innerHTML += `
      <div class="card-image-container">
        <img src="${imagePath}" alt="Image">
        <div class="card-image-license-info">Image from the repository. ©${moduleData.license}</div>
      </div>
        `;
      }

      if (moduleData.outdated) {
        card.className += " outdated";
        card.innerHTML += `
      <p><b>⚠ This module is outdated:</b> ${moduleData.outdated}</p>
      <hr>
      `;
      }

      card.innerHTML += `
        <p>${moduleData.description}</p>
        `;
      if (moduleData.tags) {
        card.innerHTML += `
                <p><b>Tags:</b> ${moduleData.tags
    .map((tag) => `#${tag}`)
    .join(" ")}</p>
              `;
      }
      moduleCardContainer.appendChild(card);
    } else {
      moduleCounter -= 1;
    }
  });

  const moduleCountElement = document.getElementById("module-count-value");
  moduleCountElement.textContent = `${moduleCounter} of ${allModules.length}`;

  if (moduleCounter === allModules.length) {
    resetButton.style.display = "none";
  } else {
    resetButton.style.display = "block";
  }
}

function sortData (sortOption) {
  switch (sortOption) {
    case "lastcommit":
      filteredModuleList.sort((a, b) =>
        b.last_commit.localeCompare(a.last_commit));
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
      // Put oudated to the end
        Boolean(a.outdated) - Boolean(b.outdated) ||
        // Sort by issue count
        a.issues - b.issues ||
        // Sort by last commit date
        b.last_commit.localeCompare(a.last_commit));
  }
}

function displayTagButtonContainer () {
  const tags = [
    "calendar",
    "news",
    "public transport",
    "smarthome",
    "soccer",
    "text-to-speech",
    "stock",
    "traffic",
    "voice control",
    "weather"
  ];
  tagButtonContainer.innerHTML = "";

  const sortedTags = tags.sort();

  sortedTags.forEach((tag) => {
    const button = document.createElement("a");
    button.className = "tag-button";
    button.setAttribute("data-tag", tag);
    button.textContent = `#${tag}`;
    tagButtonContainer.appendChild(button);
  });
}

function removeSelectedMarkingFromTagsAndCards () {
  // Remove the "selected" class from all tag buttons and cards
  const allURLs = document.querySelectorAll(".tag-button, .card");
  allURLs.forEach((url) => url.classList.remove("selected"));
}

function displayStatistics (data) {
  const lastUpdateDiv = document.getElementById("last-update");
  lastUpdateDiv.innerHTML = `Last update: ${data["last-update"]} UTC`;
}

function filterBySearchText (searchText) {
  const searchLower = searchText.toLowerCase();
  filteredModuleList = allModules.filter((card) => {
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

  // Mark the selected tag
  const selectedURL = document.querySelector(`.tag-button[data-tag="${tag}"]`);
  if (selectedURL) {
    selectedURL.classList.add("selected");
  }
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
  filteredModuleList = allModules;
  searchInput.value = "";
  showOutdated.checked = true;
  removeSelectedMarkingFromTagsAndCards();
  sortDropdown.value = "default";
  sortData(sortDropdown.value);
  updateModuleCardContainer();
});

tagButtonContainer.addEventListener("click", (event) => {
  if (event.target.tagName === "A") {
    const tag = event.target.getAttribute("data-tag");
    filterByTag(tag);
    searchInput.value = "";
  }
});

searchInput.addEventListener("input", () => {
  if (searchInput.value) {
    filterBySearchText(searchInput.value);
  } else {
    filteredModuleList = allModules;
    updateModuleCardContainer();
  }
});

// Add a change event listener to the dropdown menu
sortDropdown.addEventListener("change", () => {
  sortData(sortDropdown.value);
  updateModuleCardContainer();
});

showOutdated.addEventListener("change", () => {
  updateModuleCardContainer();
});

async function initiate () {
  const modulesFile = "modules.min.json";
  try {
    const response = await fetch(modulesFile);
    const data = await response.json();
    allModules = data;
    filteredModuleList = data;
    sortData(sortDropdown.value);
    updateModuleCardContainer();
    displayTagButtonContainer();
  } catch (error) {
    console.error("Error fetching data:", error);
  }

  const statisticsFile = "stats.json";
  try {
    const response = await fetch(statisticsFile);
    const data = await response.json();
    displayStatistics(data);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

initiate();
