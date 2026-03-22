import { createLogger } from "./logger.ts";
import fs from "node:fs";
import path from "node:path";

const logger = createLogger({ name: "shared/module-list" });

interface ModuleEntry {
  url?: string;
  [key: string]: unknown;
}

interface ModuleCollectionPayload {
  modules?: ModuleEntry[];
  [key: string]: unknown;
}

/**
 * Load the previous modules data to use as fallback.
 * @param {string} [filePath] - Path to the modules.json file. Defaults to website/data/modules.json
 * @returns {Map<string, object>} Map of module URL to module object
 */
export function loadPreviousModules<TModule extends ModuleEntry = ModuleEntry>(filePath?: string): Map<string, TModule> {
  const previousPath = filePath || path.join("website", "data", "modules.json");
  if (fs.existsSync(previousPath)) {
    try {
      const content = fs.readFileSync(previousPath, "utf8");
      const data = JSON.parse(content) as ModuleEntry[] | ModuleCollectionPayload;
      // Handle both array and object wrapper formats
      const modules: TModule[] = (Array.isArray(data) ? data : data.modules || []) as TModule[];
      logger.info(`Loaded ${modules.length} modules from previous run for fallback.`);
      const entries = modules
        .filter((module): module is TModule & { url: string } => typeof module.url === "string" && module.url.length > 0)
        .map(module => [module.url, module] as const);
      return new Map(entries);
    }
    catch (error: unknown) {
      logger.warn("Failed to load previous modules.json", { error: error instanceof Error ? error.message : String(error) });
    }
  }
  return new Map();
}
