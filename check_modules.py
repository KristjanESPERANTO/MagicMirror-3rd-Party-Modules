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
        "stylelint-config-prettier": {
            "name": "Update `stylelint` and remove `stylelint-config-prettier`.",
            "category": "Deprecated"
        },
        "Magic Mirror": {
            "name": "Replace it with `MagicMirror²`.",
            "category": "Typo"
            },
        "MagicMirror2": {
            "name": "Replace it with `MagicMirror²`.",
            "category": "Typo"
        },
        "<sub>2</sub>": {
            "name": "Replace it with `²`.`.",
            "category": "Typo"
        },
        "require(\"request\")": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated"
        },
        "require('request')": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated"
        },
        "require(\"https\")": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation"
        },
        "require('https')": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation"
        },
        "electron-rebuild": {
            "name": "Replace it with `@electron/rebuild`",
            "category": "Deprecated"
        },
        "node-fetch": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation"
        },
        "omxplayer": {
            "name": "Try to replace it with `vlc`.",
            "category": "Deprecated",
            "source": "https://github.com/popcornmix/omxplayer"
        },
        "XMLHttpRequest": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation"
        },
        "uses: actions/checkout@v3": {
            "name": "Replace it with v4.",
            "category": "Recommendation"
        },
        "node-version: 14": {
            "name": "Update to current version.",
            "category": "Deprecated"
        },
        "node-version: [14": {
            "name": "Update to current version.",
            "category": "Deprecated"
        },
        "node-version: 16": {
            "name": "Update to current version.",
            "category": "Deprecated"
        },
        "node-version: [16": {
            "name": "Update to current version.",
            "category": "Deprecated"
        },
        "github/super-linter@": {
            "name": "Replace it with `github/super-linter/slim@`.",
            "category": "Recommendation"
        }
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
        print(progress, end='')

        module_name = module_directory.name.split("-----")[0]
        module_owner = module_directory.name.split("-----")[1]
        issues = []

        if not module_name.startswith("MMM-"):
            issues.append(
                "Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module.")

        for file_path in sorted(module_directory.rglob("*")):
            if file_path.is_dir():
                # .count == 1: If there is a node_modules directory, there are probably others in it with that name. There does not have to be an additional message for this.
                if file_path.name == "node_modules" and str(file_path).count("node_modules") == 1:
                    issues.append(
                        "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`.")
            elif not file_path.is_symlink() and "node_modules" not in str(file_path):
                if "changelog" not in str(file_path).lower() and "package-lock.json" not in str(file_path).lower():
                    for search_string, value in search_strings.items():
                        found_string = search_in_file(file_path, search_string)
                        if found_string:
                            issues.append(f"{value['category']} - Found '{search_string}' in file `{file_path.name}`: {value['name']}")
                if ".yml" in str(file_path).lower():
                    issues.append(
                        f"`{file_path.name}`: Change file extention from `.yml` to `.yaml`: <https://yaml.org/faq.html>.")

        if len(issues) > 0:
            url = subprocess.run(f"cd {module_directory} && git remote get-url origin && cd ..",
                                 stdout=subprocess.PIPE, shell=True, check=False)
            url_string = url.stdout.decode().rstrip()

            output.write(f"\n## [{module_name} by {module_owner}]({url_string})\n\n")
            for idx, issue in enumerate(issues):
                output.write(f"{idx+1}. {issue}\n")
    print(f"{len(all_modules_directories)} modules analyzed. For results see file result.md.           ")
    output.close()


check_modules()
