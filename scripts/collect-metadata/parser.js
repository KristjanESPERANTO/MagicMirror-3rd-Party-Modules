import { getRepositoryId, getRepositoryType } from "../updateRepositoryApiData/helpers.js";

/**
 * Extract the maintainer URL from a repository URL.
 *
 * @param {string} url - The repository URL.
 * @returns {string} The maintainer URL or empty string if invalid.
 */
function getMaintainerURL(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 1) {
      return `${urlObj.origin}/${pathParts[0]}`;
    }
  }
  catch {
    // Invalid URL, return empty string
  }

  return "";
}

/**
 * Parse the Markdown content into a list of module objects.
 *
 * @param {string} markdown - The raw Markdown content from the Wiki.
 * @returns {{modules: Array<object>, issues: Array<string>}} The parsed modules and any issues encountered.
 */
export function parseModuleList(markdown) {
  const modules = [];
  const issues = [];
  let category = "Unknown";

  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.startsWith("### ")) {
      category = line.replace("### ", "").trim();
    }
    else if (
      line.includes("](https://github.com/")
      || line.includes("](https://gitlab.com/")
      || line.includes("](https://bitbucket.org/")
    ) {
      const parts = line.split("|").map(part => part.trim());

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
          // Optional 5th column for outdated information (for "Outdated Modules" category)
          const outdatedInfo = parts[4] ? parts[4].trim() : "";

          let maintainer = maintainerCell;

          const maintainerMatch = maintainerCell.match(/\[(.*?)\]\((.*?)\)/u);
          if (maintainerMatch) {
            maintainer = maintainerMatch[1].trim();
            // We ignore the wiki maintainerURL and derive it from repo URL instead
          }

          /*
           * Basic validation
           */
          const repoType = getRepositoryType(url);
          if (repoType === "unknown") {
            issues.push(`Skipping unknown repository type: ${url}`);
          }
          else {
            const id = getRepositoryId(url) || name.replace(/\s+/gu, "-");
            const maintainerURL = getMaintainerURL(url);

            const moduleEntry = {
              name,
              url,
              id,
              description,
              maintainer,
              maintainerURL,
              category,
              issues: []
            };

            // Add outdated field if present and non-empty
            if (outdatedInfo && outdatedInfo.length > 0) {
              moduleEntry.outdated = outdatedInfo;
            }

            modules.push(moduleEntry);
          }
        }
      }
    }
  }

  return { modules, issues };
}
