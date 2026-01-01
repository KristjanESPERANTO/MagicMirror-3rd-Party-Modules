/**
 * Recursively sorts object keys to ensure deterministic JSON output.
 * Arrays and primitives are returned as-is.
 *
 * @param {unknown} obj - The value to sort (object, array, or primitive)
 * @returns {unknown} The same value with sorted object keys
 */
export function sortObjectKeys (obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  const sorted = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

/**
 * Stringifies JSON with deterministic key order.
 *
 * @param {unknown} data - The data to stringify
 * @param {number|null} space - Number of spaces for indentation (null for compact)
 * @returns {string} JSON string with sorted keys
 */
export function stringifyDeterministic (data, space = 2) {
  const sorted = sortObjectKeys(data);
  return JSON.stringify(sorted, null, space);
}

/**
 * Creates a deterministic filename for screenshots.
 * Uses module name and maintainer to ensure:
 * - Same module always gets same filename
 * - Different modules get different filenames
 * - No dependency on original image filename
 * - Human-readable and debuggable
 *
 * @param {string} moduleName - The module name
 * @param {string} maintainer - The module maintainer
 * @param {string} extension - The file extension (e.g., 'jpg', 'png')
 * @returns {string} Deterministic filename (e.g., 'MMM-Weather---example.jpg')
 */
export function createDeterministicImageName (moduleName, maintainer, extension = "jpg") {
  return `${moduleName}---${maintainer}.${extension}`;
}
