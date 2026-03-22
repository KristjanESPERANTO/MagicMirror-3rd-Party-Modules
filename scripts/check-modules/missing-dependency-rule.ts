export const MISSING_DEPENDENCY_RULE_ID = "pkg-missing-dependency";

export const MISSING_DEPENDENCY_RULE_DEFINITION = Object.freeze({
  id: MISSING_DEPENDENCY_RULE_ID,
  scope: "module-analysis",
  patterns: ["missing-dependency"],
  category: "Recommendation",
  description:
    "Declare every non built-in dependency you import so it can be installed automatically."
});
