let allData = [];
let filteredCards;
const resetButton = document.getElementById("show-all-button");
const cardContainer = document.getElementById("card-container");
const searchInput = document.getElementById("search-input");
const tagButtonContainer = document.getElementById("tag-buttons");
const sortDropdown = document.getElementById("sort-dropdown");

function displayCards() {
  cardContainer.innerHTML = "";

  const cardCountValue = filteredCards.length;
  const cardCountElement = document.getElementById("card-count-value");
  cardCountElement.textContent = `${cardCountValue} of ${allData.length}`;

  filteredCards.forEach((cardData) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
              <div class="card-header"><a href="${cardData.url}" target="_blank">${cardData.name}</a></div>
              
            `;
    if (cardData.image) {
      const imagePath = `./images/${cardData.name}---${cardData.maintainer}---${cardData.image}`;
      card.innerHTML += `
      <div class="card-image-container">
        <img src="${imagePath}" alt="Image">
        <div class="card-image-license-info">Image from the repository. ©${cardData.license}</div>
      </div>
        `;
    }

    if (cardData.outdated) {
      card.className += " outdated";
      card.innerHTML += `
      <p><b>⚠ This module is outdated:</b> ${cardData.outdated}</p>
      <hr>
      `;
    }

    card.innerHTML += `
        <p>${cardData.description}</p>
        <p><b>Maintainer:</b> ${cardData.maintainer}</p>
        `;
    if (cardData.tags) {
      card.innerHTML += `
                <p><b>Tags:</b> ${cardData.tags
                  .map((tag) => `#${tag}`)
                  .join(" ")}</p>
              `;
    }
    cardContainer.appendChild(card);
  });

  // Add an event listener for clicks on the cards
  cardContainer.addEventListener("click", (event) => {
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
}

function sortData(sortOption) {
  switch (sortOption) {
    case "name":
      // Sort by name
      filteredCards.sort((a, b) => {
        const nameA = a.name.replace("MMM-", "");
        const nameB = b.name.replace("MMM-", "");
        return nameA.localeCompare(nameB);
      });
      break;
    case "default":
      // Sort by last commit date
      filteredCards.sort((a, b) => b.last_commit.localeCompare(a.last_commit));
      // Sort by issue count
      filteredCards.sort((a, b) => a.issues.length - b.issues.length);
      // Put oudated to the end
      filteredCards.sort((a, b) => !!a.outdated - !!b.outdated);
      break;
  }
}

function displayTagButtonContainer() {
  const tags = [
    "news",
    "public transport",
    "soccer",
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

function removeSelectedMarkingFromTagsAndCards() {
  // Remove the "selected" class from all tag buttons and cards
  const allURLs = document.querySelectorAll(".tag-button, .card");
  allURLs.forEach((url) => url.classList.remove("selected"));
}

function updateDisplay() {
  sortData(sortDropdown.value);
  displayCards();
}

function filterBySearchText(searchText) {
  const searchLower = searchText.toLowerCase();
  filteredCards = allData.filter((card) => {
    const cardText = card.text ? card.text.toLowerCase() : "";
    const cardDescription = card.description
      ? card.description.toLowerCase()
      : "";
    const cardName = card.name ? card.name.toLowerCase() : "";
    const cardTags = card.tags ? card.tags : [];

    return (
      cardText.includes(searchLower) ||
      cardDescription.includes(searchLower) ||
      cardName.includes(searchLower) ||
      cardTags.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  });

  // Show resetButton
  resetButton.style.display = "block";

  removeSelectedMarkingFromTagsAndCards();

  updateDisplay();
}

function filterByTag(tag) {
  filteredCards = allData.filter((card) => {
    const tags = card.tags;
    if (tags) {
      return tags.includes(tag);
    }
    return false;
  });

  // Empty the search field
  searchInput.value = "";

  // Show resetButton
  resetButton.style.display = "block";

  removeSelectedMarkingFromTagsAndCards();

  updateDisplay();

  // Mark the selected tag
  const selectedURL = document.querySelector(`.tag-button[data-tag="${tag}"]`);
  if (selectedURL) {
    selectedURL.classList.add("selected");
  }
}

resetButton.addEventListener("click", () => {
  filteredCards = allData;

  // Empty the search field
  searchInput.value = "";

  // Hide resetButton
  resetButton.style.display = "none";

  removeSelectedMarkingFromTagsAndCards();

  updateDisplay();
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
    resetButton.style.display = "none";
    filteredCards = allData;
    updateDisplay();
  }
});

// Add a change event listener to the dropdown menu
sortDropdown.addEventListener("change", () => {
  updateDisplay();
});

async function initiate() {
  const apiUrl = "modules.min.json";
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    allData = data;
    filteredCards = data;
    updateDisplay();
    displayTagButtonContainer();
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

initiate();
