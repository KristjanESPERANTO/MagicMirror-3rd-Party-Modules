const config = {
  configBasedir: "./",
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["modules/", "docs/fonts/"],
  plugins: ["stylelint-prettier"],
  root: true,
  rules: {
    "prettier/prettier": true
  }
};

export default config;

