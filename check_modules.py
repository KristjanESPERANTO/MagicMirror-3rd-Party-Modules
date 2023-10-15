#!/usr/bin/python3
"""Function to run some checks to all downloaded modules."""

from pathlib import Path
from datetime import datetime
import subprocess

def search_in_file(path, searchstring):
    """Function to search a string in a file."""
    try:
        with open(path, "r", encoding="utf-8") as file:
            if searchstring in file.read():
                return True
    except UnicodeDecodeError:
        pass


def check_modules():
    """Function to search a string in a file."""
    search_strings = {
        "stylelint-config-prettier": "Deprecated since `stylelint` v15. Update `stylelint` and remove `stylelint-config-prettier`.",
        "Magic Mirror": "Replace it with `MagicMirror²`.",
        "MagicMirror2": "Replace it with `MagicMirror²`.",
        "<sub>2</sub>": "Replace it with `²`.",
        "require(\"request\")": "Replace it with built-in fetch.",
        "require('request')": "Replace it with built-in fetch.",
        "require(\"https\")": "Replace it with built-in fetch.",
        "require('https')": "Replace it with built-in fetch.",
        "require('bent')": "Replace it with built-in fetch.",
        "electron-rebuild": "Replace it with `@electron/rebuild`",
        "node-fetch": "Replace it with built-in fetch.",
        "XMLHttpRequest": "Replace it with built-in fetch.",
        "uses: actions/setup-node@v3": "Replace it with v4.",
        "node-version: 14": "Deprecated: Update to current version.",
        "node-version: [14": "Deprecated: Update to current version.",
        "node-version: 16": "Deprecated: Update to current version.",
        "node-version: [16": "Deprecated: Update to current version.",
        "github/super-linter@": "Replace it with `github/super-linter/slim@`."
    }

    all_modules_path = Path("./modules")
    all_modules_directories = sorted([f for f in all_modules_path.iterdir() if f.is_dir()])

    output = open("result.md", "w", encoding="utf-8")
    output.write("# Result of the module analysis\n\n")
    output.write(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    output.write(f"Number of analyzed modules: {len(all_modules_directories)}\n")

    for i, module_directory in enumerate(all_modules_directories):

        # Print progress
        progress = f"{i:4}/{len(all_modules_directories)}\r"
        print(progress, end = '')

        module_name = module_directory.name.split("-----")[0]
        module_owner = module_directory.name.split("-----")[1]
        issues = []

        if not module_name.startswith("MMM-"):
            issues.append("Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module.")

        for file_path in sorted(module_directory.rglob("*")):
            if file_path.is_dir():
                if file_path.name == "node_modules":
                    issues.append(
                        "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`.")
            elif not file_path.is_symlink() and ".min.js" not in str(file_path):
                if "changelog" not in str(file_path).lower() and "package-lock.json" not in str(file_path).lower():
                    for search_string, value in search_strings.items():
                        found_string = search_in_file(file_path, search_string)
                        if found_string:
                            issues.append(f"found '{search_string}' in file `{file_path.name}`: {value}")
                if ".yml" in str(file_path).lower():
                    issues.append(f"`{file_path.name}`: Change file extention from `.yml` to `.yaml`: <https://yaml.org/faq.html>.")

        if len(issues) > 0:
            url = subprocess.run(f"cd {module_directory} && git remote get-url origin && cd ..", stdout=subprocess.PIPE, shell=True, check=False)
            url_string = url.stdout.decode().rstrip()

            output.write(f"\n## [{module_name} by {module_owner}]({url_string})\n\n")
            for idx, issue in enumerate(issues):
                output.write(f"{idx+1}. {issue}\n")
    print(f"{len(all_modules_directories)} modules analyzed. For results see file result.md.           ")
    output.close()

check_modules()
