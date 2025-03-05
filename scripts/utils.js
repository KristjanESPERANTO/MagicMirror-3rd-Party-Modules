import fs from "node:fs";

function getJson (filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(data);
  return json;
}

function isMinified (filePath) {
  const fileContent = fs.readFileSync(filePath, "utf8");
  const whitespacePercentage = 0.05;
  const minWhitespace = fileContent.length * whitespacePercentage;
  const hasShortVariableNames = (/[\w]{1,2}\s*=\s*[^;]+;/gu).test(fileContent);
  const whitespaceCount = (fileContent.match(/\s/gu) || []).length;
  const isBelowWhitespaceThreshold = whitespaceCount <= minWhitespace;
  return hasShortVariableNames && isBelowWhitespaceThreshold;
}

export {getJson, isMinified};
