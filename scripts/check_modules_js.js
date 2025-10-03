import fs from "node:fs";
import {getRuleById} from "./check-modules/rule-registry.js";
import {validateStageData} from "./lib/schemaValidator.js";

const LEGACY_MAIN_JS_RULE_ID = "legacy-main-js-mismatch";
const legacyMainJsRule = getRuleById(LEGACY_MAIN_JS_RULE_ID);
const legacyMainJsMessage = legacyMainJsRule?.description ?? "Repository name and main js file name is not the same.";
// Disabled: import {isMinified} from "./utils.js";

fs.readFile("./website/data/modules.stage.4.json", "utf8", (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  const modules = JSON.parse(data);
  validateStageData("modules.stage.4", modules);

  modules.modules.forEach((module) => {
    const filePath = `./modules/${module.name}-----${module.maintainer}/${module.name}.js`;

    if (fs.existsSync(filePath)) {

      /*
       * We decided to ignore the minified check for now. Seems that it's not a big issue, since the source files are available in the modules.
       * if (isMinified(filePath)) {
       *  console.log(`${module.name} is minified - ${filePath}`);
       *  module.issues.push(`The main js file ${module.name}.js is minified. Please consider to replace it with a non-minified version for better readability and error analysis.`);
       * }
       */

    } else if (module.name !== "mmpm") {
      module.issues.push(legacyMainJsMessage);
    }
  });

  validateStageData("modules.stage.5", modules);

  fs.writeFileSync("./website/data/modules.stage.5.json", JSON.stringify(modules, null, 2));
});
