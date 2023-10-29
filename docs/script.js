let allData = [];
const showAllButton = document.getElementById("show-all-button");
const cardContainer = document.getElementById("card-container");
const searchInput = document.getElementById("search-input");
const tagButtonContainer = document.getElementById("tag-buttons");

function displayCards(cards) {
  cardContainer.innerHTML = "";

  const cardCountValue = cards.length;
  const cardCountElement = document.getElementById("card-count-value");
  cardCountElement.textContent = `${cardCountValue} of ${allData.length}`;

  cards.forEach((cardData) => {
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

function removeAllSelected() {
  // Remove the "selected" class from all tag buttons and cards
  const allURLs = document.querySelectorAll(".tag-button, .card");
  allURLs.forEach((url) => url.classList.remove("selected"));
}

function updateDisplay(searchText) {
  let filteredCards = allData;

  if (typeof searchText === "string") {
    const searchLower = searchText.toLowerCase();
    filteredCards = filteredCards.filter((card) => {
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

    // Show showAllButton
    showAllButton.style.display = "block";
  } else {
    // Empty the search field
    searchInput.value = "";

    // Hide showAllButton
    showAllButton.style.display = "none";
  }

  removeAllSelected();
  displayCards(filteredCards);
  displayTagButtonContainer();
}

function filterByTag(tag) {
  const data = allData;
  const filteredCards = data.filter((card) => {
    const tags = card.tags;
    if (tags) {
      return tags.includes(tag);
    }
    return false;
  });
  displayCards(filteredCards);

  removeAllSelected();

  // Mark the selected tag
  const selectedURL = document.querySelector(`.tag-button[data-tag="${tag}"]`);
  if (selectedURL) {
    selectedURL.classList.add("selected");
  }

  // Show showAllButton
  showAllButton.style.display = "block";
}

showAllButton.addEventListener("click", updateDisplay);

tagButtonContainer.addEventListener("click", (event) => {
  if (event.target.tagName === "A") {
    const tag = event.target.getAttribute("data-tag");
    filterByTag(tag);
    searchInput.value = "";
  }
});

searchInput.addEventListener("input", () => {
  updateDisplay(searchInput.value);
});

async function initiate() {
  const apiUrl = "modules.min.json";
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    allData = data;
    updateDisplay();
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

initiate();
