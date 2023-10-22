const fs = require('fs');

async function fetchData() {
  try {
    const url = 'https://raw.githubusercontent.com/wiki/MichMich/MagicMirror/3rd-Party-Modules.md';
    const response = await fetch(url);
    if (response.status !== 200) {
      throw new Error(`The fetch() call failed. Status code: ${response.status}`);
    }
    const markdown = await response.text();
    return markdown;
  } catch (error) {
    console.error(error);
  }
}

async function createModuleList() {
  markdown = await fetchData();
  const modules = [];
  for (const line of markdown.split('\n')) {
    if (line.includes("](https://github.com/") || line.includes("](https://gitlab.com/")) {

      // Split the line into an array of parts, and trim each part.
      const parts = line.split('|').map((part) => {
        return part.trim();
      });

      if (parts.length === 5) {
        let issues = [];

        let name = parts[1].match(/\[(.*?)\]\((.*?)\)/)[1];
        let url = parts[1].match(/\[(.*?)\]\((.*?)\)/)[2];
        if (!url.startsWith("https://github.com") && !url.startsWith("https://gitlab.com")) {
          issues.push("URL: Neither a valid GitHub nor a valid GitLab URL. " + url);
        }

        let id = url.replace("https://github.com/", "").replace("https://gitlab.com/", "");

        let maintainerLinked = parts[2].match(/\[(.*?)\]\((.*?)\)/);
        if (maintainerLinked !== null) {
          maintainer = maintainerLinked[1];
          maintainerURL = maintainerLinked[2];
        } else {
          maintainer = parts[2];
          maintainerURL = "";
        }

        let description = parts[3];

        const module = {
          name,
          url,
          id,
          maintainer,
          maintainerURL,
          description,
          issues
        };
        console.log(module);
        modules.push(module);
      }
    }
  }


  fs.writeFileSync('modules.json', JSON.stringify(modules, null, 2), 'utf8');
}

createModuleList();