import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDirectory = join(projectRoot, "website", "vendor");
const dependencies = [
  ["dompurify/dist/purify.es.mjs", "dompurify.js"],
  ["marked/lib/marked.esm.js", "marked.js"]
];

await mkdir(vendorDirectory, { recursive: true });
for (const [source, destination] of dependencies) {
  await copyFile(
    join(projectRoot, "node_modules", source),
    join(vendorDirectory, destination)
  );
}
