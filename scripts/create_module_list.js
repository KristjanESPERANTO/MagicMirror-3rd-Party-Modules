import fs from "fs";
import {marked} from "marked";
import sanitizeHtml from "sanitize-html";

async function fetchMarkdownData () {
  try {
    const url =
      "https://raw.githubusercontent.com/wiki/MagicMirrorOrg/MagicMirror/3rd-Party-Modules.md";
    const response = await fetch(url);
    if (response.status !== 200) {
      throw new Error(`The fetch() call failed. Status code: ${response.status}`);
    }
    const markdown = await response.text();
    return markdown;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function sortByNameIgnoringPrefix (a, b) {
  const nameA = a.name.replace("MMM-", "").replace("EXT-", "");
  const nameB = b.name.replace("MMM-", "").replace("EXT-", "");
  return nameA.localeCompare(nameB);
}

async function createModuleList () {
  const markdown = await fetchMarkdownData();
  const moduleList = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const line of markdown.split("\n")) {
    if (
      line.includes("](https://github.com/") ||
      line.includes("](https://gitlab.com/") ||
      line.includes("](https://bitbucket.org/")
    ) {
      // Split the line into an array of parts, and trim each part.
      const parts = line.split("|").map((part) => part.trim());

      if (parts.length === 5 || parts.length === 6) {
        const issues = [];

        const url = parts[1].match(/\[(.*?)\]\((.*?)\)/u)[2].trim();
        if (
          !url.startsWith("https://github.com") &&
          !url.startsWith("https://gitlab.com") &&
          !url.startsWith("https://bitbucket.org")
        ) {
          issues.push(`URL: Neither a valid GitHub nor a valid GitLab URL: ${url}.`);
        }

        const id = url
          .replace("https://github.com/", "")
          .replace("https://gitlab.com/", "");

        const maintainer = url.split("/")[3];
        const name = url.split("/")[4];

        const maintainerLinked = parts[2].match(/\[(.*?)\]\((.*?)\)/u);
        let maintainerURL = "";
        if (maintainerLinked !== null) {
          maintainerURL = maintainerLinked[2];
        }

        const descriptionMarkdown = parts[3];
        const descriptionHtml = marked.parseInline(descriptionMarkdown);
        const descriptionHtmlATarget = descriptionHtml.replaceAll(
          "<a href=",
          "<a target=\"_blank\" href="
        );
        const description = sanitizeHtml(descriptionHtmlATarget);

        const module = {
          name,
          url,
          id,
          maintainer,
          maintainerURL,
          description,
          issues
        };

        if (parts.length === 6) {
          const outdatedMarkdown = parts[4];
          const outdatedHtml = marked.parseInline(outdatedMarkdown);
          const outdated = sanitizeHtml(outdatedHtml);
          module.outdated = outdated;
        }

        moduleList.push(module);
      }
    }
  }

  const sortedModuleList = moduleList.sort(sortByNameIgnoringPrefix);
  const data = {
    "lastUpdate": new Date().toISOString(),
    "modules": sortedModuleList
  };


  fs.writeFileSync(
    "./docs/data/modules.stage.1.json",
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

createModuleList();
