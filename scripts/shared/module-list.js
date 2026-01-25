import { createLogger } from "./logger.js";
import fs from "node:fs";
import path from "node:path";

const logger = createLogger({ name: "shared/module-list" });

/**
 * Load the previous modules data to use as fallback.
 * @param {string} [filePath] - Path to the modules.json file. Defaults to website/data/modules.json
 * @returns {Map<string, object>} Map of module URL to module object
 */
export function loadPreviousModules(filePath) {
  const previousPath = filePath || path.join("website", "data", "modules.json");
  if (fs.existsSync(previousPath)) {
    try {
      const content = fs.readFileSync(previousPath, "utf8");
      const data = JSON.parse(content);
      // Handle both array and object wrapper formats
      const modules = Array.isArray(data) ? data : data.modules || [];
      logger.info(`Loaded ${modules.length} modules from previous run for fallback.`);
      return new Map(modules.map(module => [module.url, module]));
    }
    catch (error) {
      logger.warn("Failed to load previous modules.json", { error: error.message });
    }
  }
  return new Map();
}
