import {getRepositoryType} from "../updateRepositoryApiData/helpers.js";

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
          const url = repoMatch[2].trim();
          const name = repoMatch[1].trim(); // Use the link text as the name initially
          const description = parts[2] || "";
          const maintainer = parts[3] || "";

          // Basic validation
          const repoType = getRepositoryType(url);
          if (repoType === "unknown") {
            issues.push(`Skipping unknown repository type: ${url}`);
          } else {
            modules.push({
              name,
              url,
              description,
              maintainer,
              category,
              source: "wiki"
            });
          }
        }
      }
    }
  }

  return {modules, issues};
}
