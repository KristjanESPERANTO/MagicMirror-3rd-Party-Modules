import fs from "node:fs";

function getJson (filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(data);
  return json;
}

export {getJson};
