import {createHttpClient} from "./shared/http-client.js";
import fs from "node:fs";
import {marked} from "marked";
import process from "node:process";
import sanitizeHtml from "sanitize-html";
import {validateStageData} from "./lib/schemaValidator.js";

const httpClient = createHttpClient();

async function fetchMarkdownData () {
  try {
    let markdown = "";
    if (process.env.WIKI_FILE) {
      markdown = fs.readFileSync(`${process.env.WIKI_FILE}`, "utf8");
    } else {
      const url =
        "https://raw.githubusercontent.com/wiki/MagicMirrorOrg/MagicMirror/3rd-Party-Modules.md";
      const result = await httpClient.getText(url);
      if (!result.ok) {
        throw new Error(`The fetch() call failed. Status code: ${result.status}`);
      }
      markdown = result.data;
    }
    return markdown;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function sortByNameIgnoringPrefix (a, b) {
  const nameA = a.name.replace("MMM-", "");
  const nameB = b.name.replace("MMM-", "");
  return nameA.localeCompare(nameB);
}

function deriveMaintainerUrl ({repoUrl, maintainer, maintainerUrlFromWiki}) {
  const trimmedWikiUrl = (maintainerUrlFromWiki ?? "").trim().split(/\s+/u)[0];
  if (trimmedWikiUrl.length > 0) {
    return trimmedWikiUrl;
  }

  if (repoUrl) {
    try {
      const parsed = new URL(repoUrl);
      if (maintainer) {
        return `${parsed.origin}/${maintainer}`;
      }
      return parsed.origin;
    } catch {
      // Fall through to the GitHub fallback.
    }
  }

  if (maintainer) {
    return `https://github.com/${maintainer}`;
  }

  throw new Error("Unable to derive maintainer URL – repository URL and maintainer missing.");
}

async function createModuleList () {
  const markdown = await fetchMarkdownData();
  const moduleList = [];
  let category = "";
  const missingRepoErrors = [];

  for (const line of markdown.split("\n")) {
    if (line.startsWith("### ")) {
      category = line.replace("### ", "").trim();
    }

    if (
      line.includes("](https://github.com/") ||
      line.includes("](https://gitlab.com/") ||
      line.includes("](https://bitbucket.org/")
    ) {
      // Split the line into an array of parts, and trim each part.
      const parts = line.split("|").map((part) => part.trim());

      if (parts.length === 5 || parts.length === 6) {
        const issues = [];

        const repoCell = parts[1];
        const repoMatch = repoCell.match(/\[(.*?)\]\((.*?)\)/u);

        if (repoMatch === null) {
          missingRepoErrors.push(line);
        } else {
          const url = repoMatch[2].trim();
          if (
            !url.startsWith("https://github.com") &&
            !url.startsWith("https://gitlab.com") &&
            !url.startsWith("https://bitbucket.org")
          ) {
            issues.push(`URL: Neither a valid GitHub nor a valid GitLab URL: ${url}.`);
          }

          const maintainer = url.split("/")[3];
          const name = url.split("/")[4];

          const id = `${maintainer}/${name}`;

          const maintainerLinked = parts[2].match(/\[(.*?)\]\((.*?)\)/u);
          const maintainerURL = deriveMaintainerUrl({
            repoUrl: url,
            maintainer,
            maintainerUrlFromWiki: maintainerLinked?.[2]
          });

          const descriptionMarkdown = parts[3];
          const descriptionHtml = marked.parseInline(descriptionMarkdown);
          const descriptionHtmlATarget = descriptionHtml.replaceAll(
            "<a href=",
            "<a target=\"_blank\" href="
          );
          const description = sanitizeHtml(descriptionHtmlATarget);

          const module = {
            name,
            category,
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
  }

  const sortedModuleList = moduleList.sort(sortByNameIgnoringPrefix);
  const data = {
    lastUpdate: new Date().toISOString(),
    modules: sortedModuleList
  };

  if (missingRepoErrors.length > 0) {
    throw new Error(`[create_module_list] Missing repository link in ${missingRepoErrors.length} line(s):\n${missingRepoErrors.join("\n")}`);
  }

  try {
    validateStageData("modules.stage.1", data);
  } catch (error) {
    if (error?.errors?.length > 0) {
      for (const validationError of error.errors) {
        if (validationError.instancePath?.startsWith("/modules/")) {
          const pathParts = validationError.instancePath.split("/").filter(Boolean);
          const index = Number.parseInt(pathParts[1], 10);
          const moduleSnapshot = Number.isInteger(index) ? data.modules[index] : null;
          console.error("Validation failure for module:", {
            index,
            name: moduleSnapshot?.name,
            maintainer: moduleSnapshot?.maintainer,
            maintainerURL: moduleSnapshot?.maintainerURL,
            issue: validationError.message
          });
        }
      }
    }
    throw error;
  }

  fs.writeFileSync(
    "./website/data/modules.stage.1.json",
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

createModuleList().catch((error) => {
  console.error(error);
  process.exit(1);
});
