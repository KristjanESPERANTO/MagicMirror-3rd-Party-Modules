import * as fsPromises from "node:fs/promises";
import { analyzeModule } from "../../check-modules/module-analyzer.ts";
import { strict as assert } from "node:assert";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";

async function createTempModule() {
  const root = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-test-"));
  await fsPromises.mkdir(join(root, ".github"), { recursive: true });

  await fsPromises.writeFile(
    join(root, "README.md"),
    [
      "# MMM-Remote-Control",
      "",
      "## Installation",
      "git clone https://github.com/Jopyth/MMM-Remote-Control",
      "",
      "## Update",
      "Update steps",
      "",
      "## Config",
      "{",
      "  module: \"MMM-Remote-Control\",",
      "  config: {",
      "    foo: true",
      "  },",
      "},",
      ""
    ].join("\n")
  );

  await fsPromises.writeFile(
    join(root, "CHANGELOG.md"),
    "XMLHttpRequest\nnpm run\ngit checkout\n"
  );
  await fsPromises.writeFile(join(root, "CODE_OF_CONDUCT.md"), "code of conduct");
  await fsPromises.writeFile(join(root, "LICENSE.md"), "license");
  await fsPromises.writeFile(join(root, "eslint.config.mjs"), "export default [];\n");
  await fsPromises.writeFile(
    join(root, "package.json"),
    JSON.stringify(
      {
        devDependencies: { eslint: "^10.0.0" },
        scripts: { lint: "eslint" }
      },
      null,
      2
    )
  );
  await fsPromises.writeFile(
    join(root, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "x",
        note: "jshint",
        lockfileVersion: 2,
        scripts: { test: "npm run lint" }
      },
      null,
      2
    )}\n`
  );
  await fsPromises.writeFile(join(root, ".github", "dependabot.yaml"), "version: 2\nupdates: []\n");

  return root;
}

test("analyzer keeps .github files and applies only lockfile-specific package-lock rules", async () => {
  const moduleRoot = await createTempModule();
  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "CHANGELOG.md"),
    join(moduleRoot, "CODE_OF_CONDUCT.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "eslint.config.mjs"),
    join(moduleRoot, "package.json"),
    join(moduleRoot, "package-lock.json"),
    join(moduleRoot, ".github", "dependabot.yaml")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Remote-Control",
    "https://github.com/Jopyth/MMM-Remote-Control",
    files
  );

  assert.equal(
    result.issues.some(issue => issue.includes("There is no dependabot configuration file")),
    false
  );
  assert.equal(
    result.issues.some(issue => issue.includes("in file `CHANGELOG.md`")),
    false
  );
  assert.equal(
    result.issues.some(
      issue => issue.includes("Found `jshint`") && issue.includes("in file `package-lock.json`")
    ),
    false
  );
  assert.equal(
    result.issues.some(
      issue => issue.includes("Found `\"lockfileVersion\": 2`") && issue.includes("in file `package-lock.json`")
    ),
    true
  );

  assert.ok(Array.isArray(result.issues));
});

test("analyzer applies classic-module exceptions for mmpm", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-mmpm-test-"));

  await fsPromises.writeFile(join(moduleRoot, "README.md"), "# mmpm\n");
  await fsPromises.writeFile(join(moduleRoot, "LICENSE.md"), "MIT\n");
  await fsPromises.writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify({
      name: "mmpm",
      version: "1.0.0"
    })
  );

  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "package.json")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "mmpm",
    "https://github.com/Bee-Mar/mmpm",
    files
  );

  assert.equal(result.issues.some(issue => issue.includes("README seems not to have an update section")), false);
  assert.equal(result.issues.some(issue => issue.includes("There is no CODE_OF_CONDUCT file")), true);
  assert.equal(result.issues.some(issue => issue.includes("There is no dependabot configuration file")), false);
  assert.equal(result.issues.some(issue => issue.includes("No linter configuration was found")), false);
});

test("analyzer accepts biome config as linting setup", async () => {
  const moduleRoot = await fsPromises.mkdtemp(join(tmpdir(), "module-analyzer-biome-test-"));

  await fsPromises.writeFile(join(moduleRoot, "README.md"), "# MMM-Biome-Test\n");
  await fsPromises.writeFile(join(moduleRoot, "CHANGELOG.md"), "changelog\n");
  await fsPromises.writeFile(join(moduleRoot, "CODE_OF_CONDUCT.md"), "code of conduct\n");
  await fsPromises.writeFile(join(moduleRoot, "LICENSE.md"), "MIT\n");
  await fsPromises.writeFile(join(moduleRoot, "biome.jsonc"), "{\n  \"linter\": { \"enabled\": true }\n}\n");
  await fsPromises.writeFile(
    join(moduleRoot, "package.json"),
    JSON.stringify({
      name: "mmm-biome-test",
      version: "1.0.0"
    })
  );

  const files = [
    join(moduleRoot, "README.md"),
    join(moduleRoot, "CHANGELOG.md"),
    join(moduleRoot, "CODE_OF_CONDUCT.md"),
    join(moduleRoot, "LICENSE.md"),
    join(moduleRoot, "biome.jsonc"),
    join(moduleRoot, "package.json")
  ];

  const result = await analyzeModule(
    moduleRoot,
    "MMM-Biome-Test",
    "https://github.com/example/MMM-Biome-Test",
    files
  );

  assert.equal(result.issues.some(issue => issue.includes("No linter configuration was found")), false);
  assert.equal(result.issues.some(issue => issue.includes("ESLint is not in the dependencies or devDependencies")), false);
  assert.equal(result.issues.some(issue => issue.includes("lint script in package.json does not contain `eslint`")), false);
});
