import {getRepositoryId, getRepositoryType} from "../updateRepositoryApiData/helpers.js";

/**
 * Parse the Markdown content into a list of module objects.
 *
 * @param {string} markdown - The raw Markdown content from the Wiki.
 * @returns {{modules: Array<object>, issues: Array<string>}} The parsed modules and any issues encountered.
 */
export function parseModuleList (markdown) {
  const modules = [];
  const issues = [];
  let category = "Unknown";

  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.startsWith("### ")) {
      category = line.replace("### ", "").trim();
    } else if (
      line.includes("](https://github.com/") ||
      line.includes("](https://gitlab.com/") ||
      line.includes("](https://bitbucket.org/")
    ) {
      const parts = line.split("|").map((part) => part.trim());

      // Expected format: | Name | Repo Link | Description | Author | ...
      if (parts.length >= 3) {
        const repoCell = parts[1];
        const repoMatch = repoCell.match(/\[(.*?)\]\((.*?)\)/u);

        if (repoMatch) {
          let url = repoMatch[2].trim();
          // Remove title from URL if present
          const urlTitleStart = url.indexOf(" ");
          if (urlTitleStart !== -1) {
            url = url.substring(0, urlTitleStart);
          }

          const name = repoMatch[1].trim(); // Use the link text as the name initially
          const maintainerCell = parts[2] || "";
          const description = parts[3] || "";

          let maintainer = maintainerCell;
          let maintainerURL = "";

          const maintainerMatch = maintainerCell.match(/\[(.*?)\]\((.*?)\)/u);
          if (maintainerMatch) {
            maintainer = maintainerMatch[1].trim();
            maintainerURL = maintainerMatch[2].trim();
            // Remove title from URL if present (e.g. "URL "Title"")
            const titleStart = maintainerURL.indexOf(" ");
            if (titleStart !== -1) {
              maintainerURL = maintainerURL.substring(0, titleStart);
            }
          }

          /*
           * ...existing code...
           * Basic validation
           */
          const repoType = getRepositoryType(url);
          if (repoType === "unknown") {
            issues.push(`Skipping unknown repository type: ${url}`);
          } else {
            const id = getRepositoryId(url) || name.replace(/\s+/gu, "-");
            modules.push({
              name,
              url,
              id,
              description,
              maintainer,
              maintainerURL: maintainerURL || url, // Fallback to repo URL if missing
              category,
              issues: []
            });
          }
        }
      }
    }
  }

  return {modules, issues};
}
