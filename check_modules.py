#!/usr/bin/python3
"""Function to run some checks to all downloaded modules."""

from pathlib import Path
from datetime import datetime
import json
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
        "require(\"native-request\")": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated"
        },
        "require('native-request')": {
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

    modules_json_file = open('./docs/modules.temp.2.json', encoding="utf-8")
    modules = json.load(modules_json_file)

    output = open("result.md", "w", encoding="utf-8")
    output.write("# Result of the module analysis\n\n")
    output.write(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
    output.write(f"Number of analyzed modules: {len(modules)}\n")

    module_counter = 0

    for module in modules:

        module_counter = module_counter +1

        module_directory = module["name"] + "-----" + module["maintainer"]

        # Print progress
        progress = f"{module_counter:4}/{len(modules)}\r"
        print(progress, end='')

        if not module["name"].startswith("MMM-"):
            module["issues"].append(
                "Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module.")

        module_directory_path = Path("./modules/" + module_directory)
        for file_path in sorted(module_directory_path.rglob("*")):
            if file_path.is_dir():
                # Explanation for .count("node_modules") == 1: If there is a node_modules directory, there are probably others in it with that name. There does not have to be an additional message for this.
                if file_path.name == "node_modules" and str(file_path).count("node_modules") == 1:
                    module["issues"].append(
                        "Issue: Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`.")
            elif not file_path.is_symlink() and "node_modules" not in str(file_path):
                if "changelog" not in str(file_path).lower() and "package-lock.json" not in str(file_path).lower():
                    for search_string, value in search_strings.items():
                        found_string = search_in_file(file_path, search_string)
                        if found_string:
                            module["issues"].append(f"{value['category']}: Found '{search_string}' in file `{file_path.name}`: {value['name']}")
                #if ".yml" in str(file_path).lower():
                #    module["issues"].append(
                #        f"`Recommendation: {file_path.name}`: Change file extention from `.yml` to `.yaml`: <https://yaml.org/faq.html>.")

        if "LICENSE" not in str(sorted(module_directory_path.rglob("*"))):
            module["issues"].append("Warning: No LICENSE file.")

        if len(module["issues"]) > 0:
            url = subprocess.run(f"cd ./modules/{module_directory} && git remote get-url origin && cd ..",
                                 stdout=subprocess.PIPE, shell=True, check=False)
            url_string = url.stdout.decode().rstrip()

            output.write(f"\n## [{module['name']} by {module['maintainer']}]({url_string})\n\n")
            for idx, issue in enumerate(module["issues"]):
                output.write(f"{idx+1}. {issue}\n")
    print(f"{module_counter} modules analyzed. For results see file result.md.           ")
    output.close()

    # Serializing json
    json_object = json.dumps(modules, indent=2)

    # Writing to modules.json
    with open("./docs/modules.json", "w", encoding="utf-8")as outfile:
        outfile.write(json_object)

    # Serializing and minifying json
    json_object = json.dumps(modules)

    # Writing to modules.min.json
    with open("./docs/modules.min.json", "w", encoding="utf-8")as outfile:
        outfile.write(json_object)

check_modules()
