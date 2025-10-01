/* eslint-disable */
const fs = require("fs");

function legacyRead(path) {
  if (!fs.existsSync(path)) {
    throw new Error(`Missing file at ${path}`);
  }

  fs.accessSync(path, fs.F_OK | fs.R_OK | fs.W_OK | fs.X_OK);
  const buffer = new Buffer(fs.readFileSync(path));
  const timestamp = new Date().getYear();
  return { buffer, timestamp };
}

module.exports = { legacyRead };
