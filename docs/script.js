document.addEventListener("DOMContentLoaded", function () {
  const apiUrl = "modules.json";
  const filterMenu = document.getElementById("filterMenu");
  const cardContainer = document.getElementById("cardContainer");
  const hamburgerIcon = document.getElementById("hamburger-icon");
  const searchInput = document.getElementById("searchInput");
  const tagButtons = document.getElementById("tagButtons");

  function displayCards(cards) {
    cardContainer.innerHTML = "";

    cards.forEach((cardData) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
              <div class="cardHeader"><a href="${
                cardData.url
              }" target="_blank">${cardData.name}</a></div>
              <img src="${cardData.image}" alt="Image">
              <p>Category: ${cardData.category}</p>
              <p>Tags: ${cardData.tags.map((tag) => `#${tag}`).join(" ")}</p>
              <p>Text: ${cardData.text}</p>
              <p>Description: ${cardData.description}</p>
              <p>Maintainer: ${cardData.maintainer}</p>
            `;

      cardContainer.appendChild(card);
    });

    // Add an event listener for clicks on the cards
    cardContainer.addEventListener("click", function (event) {
      // Check if the clicked element is a card
      const clickedCard = event.target.closest(".card");
      if (clickedCard) {
        // Remove the "selected" class from all cards
        const allCards = document.querySelectorAll(".card");
        allCards.forEach((c) => c.classList.remove("selected"));

        // Mark the selected card
        clickedCard.classList.add("selected");
      }
    });
  }

  function displayFilterMenu(categories) {
    filterMenu.innerHTML = "";
    categories.sort();
    const categoryList = document.createElement("div");

    // Add the "Show All" entry
    const allCategoryItem = document.createElement("div");
    allCategoryItem.className = "menu-item";
    allCategoryItem.innerHTML = `<a href="#" data-category="all">Show All</a>`;
    categoryList.appendChild(allCategoryItem);

    // Add the remaining categories
    categories.forEach((category) => {
      const listItem = document.createElement("div");
      listItem.className = "menu-item";
      listItem.innerHTML = `<a href="#" data-category="${category}">${category}</a>`;
      categoryList.appendChild(listItem);
    });

    filterMenu.appendChild(categoryList);
  }

  function displayTagButtons(tags) {
    tagButtons.innerHTML = "";

    const sortedTags = tags.sort();

    sortedTags.forEach((tag) => {
      const button = document.createElement("a");
      button.className = "tag-button";
      button.setAttribute("data-tag", tag);
      button.textContent = `#${tag}`;
      tagButtons.appendChild(button);
    });
  }

  function updateDisplay(categoryFilter, searchText) {
    fetch(apiUrl)
      .then((response) => response.json())
      .then((data) => {
        let filteredCards = data;

        if (categoryFilter && categoryFilter !== "all") {
          filteredCards = filteredCards.filter(
            (card) => card.category === categoryFilter
          );
        }

        if (searchText) {
          const searchLower = searchText.toLowerCase();
          filteredCards = filteredCards.filter(
            (card) =>
              card.text.toLowerCase().includes(searchLower) ||
              card.description.toLowerCase().includes(searchLower) ||
              card.name.toLowerCase().includes(searchLower)
          );
        }

        displayCards(filteredCards);

        // Remove the "selected" class from all categories, tags, and cards
        const allURLs = document.querySelectorAll(
          ".menu-item a, .tag-button, .card"
        );
        allURLs.forEach((url) => url.classList.remove("selected"));

        if (categoryFilter !== null || searchText) {
          // filterMenu.style.display = "none";
        } else {
          filterMenu.style.display = "block";
          const categories = [...new Set(data.map((card) => card.category))];
          displayFilterMenu(categories);

          const allTags = data.reduce(
            (acc, card) => [...acc, ...card.tags],
            []
          );
          const uniqueTags = [...new Set(allTags)];
          displayTagButtons(uniqueTags);
        }

        // Empty the search field if "Show All" is selected
        if (categoryFilter === "all") {
          searchInput.value = "";
        }

        // Mark the selected menu entry
        const selectedURL = document.querySelector(
          `.menu-item a[data-category="${categoryFilter}"]`
        );
        if (selectedURL) {
          selectedURL.classList.add("selected");
        }
      })
      .catch((error) => console.error("Error fetching data:", error));
  }

  function filterByTag(tag) {
    fetch(apiUrl)
      .then((response) => response.json())
      .then((data) => {
        const filteredCards = data.filter((card) => card.tags.includes(tag));
        displayCards(filteredCards);

        // Remove the "selected" class from all categories, tags, and cards
        const allURLs = document.querySelectorAll(
          ".menu-item a, .tag-button, .card"
        );
        allURLs.forEach((url) => url.classList.remove("selected"));

        // Mark the selected tag
        const selectedURL = document.querySelector(
          `.tag-button[data-tag="${tag}"]`
        );
        if (selectedURL) {
          selectedURL.classList.add("selected");
        }
      })
      .catch((error) => console.error("Error fetching data:", error));
  }

  function removeAllSelected() {
    // Remove the "selected" class from all categories, tags, and cards
    const allURLs = document.querySelectorAll(
      ".menu-item a, .tag-button, .card"
    );
    allURLs.forEach((url) => url.classList.remove("selected"));
  }

  // Event listener for clicks outside of categories, tags, and cards
  document.addEventListener("click", function (event) {
    const isMenuClick = event.target.closest("#filterMenu");
    const isCardClick = event.target.closest("#cardContainer");
    const isTagClick = event.target.closest("#tagButtons");

    if (!isMenuClick && !isCardClick && !isTagClick) {
      removeAllSelected();
    }
  });

  hamburgerIcon.addEventListener("click", function () {
    filterMenu.style.display =
      filterMenu.style.display === "block" ? "none" : "block";
  });

  filterMenu.addEventListener("click", function (event) {
    if (event.target.tagName === "A") {
      const category = event.target.getAttribute("data-category");

      if (category === "all") {
        // If "Show All" is selected, empty the search field
        searchInput.value = "";
      }

      // Otherwise, update the display
      updateDisplay(category, searchInput.value);
    }
  });

  tagButtons.addEventListener("click", function (event) {
    if (event.target.tagName === "A") {
      const tag = event.target.getAttribute("data-tag");

      // Otherwise, update the display
      filterByTag(tag);
    }
    searchInput.value = "";
  });

  searchInput.addEventListener("input", function () {
    updateDisplay(null, searchInput.value);
  });

  updateDisplay(null, null);
});
