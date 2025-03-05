import fs from "node:fs";
import {isMinified} from "./utils.js";

fs.readFile("./docs/data/modules.stage.3.json", "utf8", (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  const modules = JSON.parse(data);

  modules.forEach((module) => {
    const filePath = `./modules/${module.name}-----${module.maintainer}/${module.name}.js`;

    if (fs.existsSync(filePath)) {
      if (isMinified(filePath)) {
        console.log(`${module.name} is minified - ${filePath}`);
        module.issues.push(`The main js file ${module.name}.js is minified. Please consider to replace it with a non-minified version for better readability and error analysis.`);
      }
    } else {
      module.issues.push("Repository name and main js file name is not the same.");
    }
  });

  fs.writeFileSync("./docs/data/modules.stage.4.json", JSON.stringify(modules, null, 2));
});
