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
        "new Buffer(": {
            "name": "This is deprecated. Please update: <https://nodejs.org/api/buffer.html>.",
            "category": "Deprecated",
        },
        "stylelint-config-prettier": {
            "name": "Update `stylelint` and remove `stylelint-config-prettier`.",
            "category": "Deprecated",
        },
        '"eslint-plugin-json"': {
            "name": "Replace it by `eslint-plugin-jsonc`.",
            "category": "Recommendation",
        },
        "Magic Mirror": {
            "name": "Replace it with `MagicMirror²`.",
            "category": "Typo",
        },
        "MagicMirror2": {
            "name": "Replace it with `MagicMirror²`.",
            "category": "Typo",
        },
        "<sub>2</sub>": {
            "name": "Replace it with `²`.`.",
            "category": "Typo"
        },
        "<sup>2</sup>": {
            "name": "Replace it with `²`.`.",
            "category": "Typo"
        },
        'require("request")': {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        "require('request')": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        'require("native-request")': {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        "require('native-request')": {
            "name": "Replace it with built-in fetch.",
            "category": "Deprecated",
        },
        'require("http")': {
            "name": 'Replace "http" by "node:http".',
            "category": "Recommendation",
        },
        "require('http')": {
            "name": "Replace 'http' by 'node:http'.",
            "category": "Recommendation",
        },
        'require("https")': {
            "name": 'Replace "https" by "node:https".',
            "category": "Recommendation",
        },
        "require('https')": {
            "name": "Replace 'https' by 'node:https'.",
            "category": "Recommendation",
        },
        " electron-rebuild": {
            "name": "Replace it with `@electron/rebuild`",
            "category": "Deprecated",
        },
        '"electron-rebuild"': {
            "name": "Replace it with `@electron/rebuild`",
            "category": "Deprecated",
        },
        '"grunt"': {
            "name": "Grunt is practically unmaintained. Move on to something better.",
            "category": "Deprecated",
        },
        "'node-fetch'": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        '"node-fetch"': {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        'require("fetch")': {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "require('fetch')": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "axios": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "omxplayer": {
            "name": "Try to replace it with `vlc`.",
            "category": "Deprecated",
            "source": "https://github.com/popcornmix/omxplayer",
        },
        "XMLHttpRequest": {
            "name": "Replace it with built-in fetch.",
            "category": "Recommendation",
        },
        "uses: actions/checkout@v2": {
            "name": "Replace it with v4.",
            "category": "Recommendation",
        },
        "uses: actions/checkout@v3": {
            "name": "Replace it with v4.",
            "category": "Recommendation",
        },
        "node-version: 14": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "node-version: [14": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "node-version: 16": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "node-version: [16": {
            "name": "Update to current version.",
            "category": "Deprecated",
        },
        "github/super-linter@": {
            "name": "Replace it with `github/super-linter/slim@`.",
            "category": "Recommendation",
        },
        "jshint": {
            "name": 'Replace "jshint" by "eslint".',
            "category": "Recommendation",
        },
        "new Date()": {
            "name": "Replace it by `new Date(Date.now())`: [#3252](https://github.com/MagicMirrorOrg/MagicMirror/issues/3252).",
            "category": "Recommendation",
        },
        "getYear()": {
            "name": "Replace `getYear()` by `getFullYear()`.",
            "category": "Deprecated",
        },
        "MichMich/MagicMirror": {
            "name": "Replace it by `MagicMirrorOrg/MagicMirror`.",
            "category": "Outdated",
        },
        "/_/husky.sh": {
            "name": "Since husky v9 you may not need this anymore.",
            "category": "Outdated",
        },
        "husky install": {
            "name": "Since husky v9 you may not need this anymore.",
            "category": "Outdated",
        },
    }

    modules_json_file = open("./docs/data/modules.stage.3.json", encoding="utf-8")
    modules = json.load(modules_json_file)
    stats = {
        "moduleCounter": 0,
        "modulesWithImageCounter": 0,
        "modulesWithIssuesCounter": 0,
        "issueCounter": 0,
        "lastUpdate": datetime.now().astimezone().replace(microsecond=0).isoformat(),
        "repositoryHoster": {},
        "maintainer": {},
    }

    markdown_output_modules = ""

    for module in modules:
        stats["moduleCounter"] += 1

        module_directory = module["name"] + "-----" + module["maintainer"]

        # Print progress
        progress = f"{stats['moduleCounter']:4}/{len(modules)}\r"
        print(progress, end="")

        if module["name"].startswith("EXT-"):
            module["description"] += " This module have been defined to work only with MMM-GoogleAssistant."

        elif not module["name"].startswith("MMM-"):
            module["issues"].append(
                "Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module."
            )

        module_directory_path = Path("./modules/" + module_directory)
        for file_path in sorted(module_directory_path.rglob("*")):
            if file_path.is_dir():
                # Explanation for .count("node_modules") == 1: If there is a node_modules directory, there are probably others in it with that name. There does not have to be an additional message for this.
                if (
                    file_path.name == "node_modules"
                    and str(file_path).count("node_modules") == 1
                ):
                    module["issues"].append(
                        "Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`."
                    )
            elif not file_path.is_symlink() and "node_modules" not in str(file_path):
                if (
                    "changelog" not in str(file_path).lower()
                    and "package-lock.json" not in str(file_path).lower()
                ):
                    for search_string, value in search_strings.items():
                        found_string = search_in_file(file_path, search_string)
                        if found_string:
                            module["issues"].append(
                                f"{value['category']}: Found `{search_string}` in file `{file_path.name}`: {value['name']}"
                            )
                # if ".yml" in str(file_path).lower():
                #    module["issues"].append(
                #        f"`Recommendation: {file_path.name}`: Change file extention from `.yml` to `.yaml`: <https://yaml.org/faq.html>.")

        if "LICENSE" not in str(sorted(module_directory_path.rglob("*"))):
            module["issues"].append("Warning: No LICENSE file.")

        if "eslintrc" in str(sorted(module_directory_path.rglob("*"))):
            module["issues"].append(
                "Recommendation: Replace eslintrc by new flat config.")
        elif "eslint.config" not in str(sorted(module_directory_path.rglob("*"))):
            module["issues"].append(
                "Recommendation: No ESLint configuration was found. ESLint is very helpful, it is worth using it even for small projects.")

        if not module_directory_path.is_dir():
            module["issues"] = [
                "Error: It appears that the repository could not be cloned. Check the URL."
            ]

        check_branch_name(module, module_directory_path)

        check_dependency_updates(module, module_directory_path)

        if "outdated" in module or len(module["issues"]) > 0:
            stats["modulesWithIssuesCounter"] += 1
            markdown_output_modules += f"\n### [{module['name']} by {module['maintainer']}]({module['url']})\n\n"

            if "outdated" in module:
                stats["issueCounter"] += 1
                markdown_output_modules += (
                    f"0. This module is outdated: {module['outdated']}\n"
                )

            if len(module["issues"]) > 0:
                stats["issueCounter"] += len(module["issues"])
                for idx, issue in enumerate(module["issues"]):
                    markdown_output_modules += f"{idx+1}. {issue}\n"

        get_last_commit_date(module, module_directory_path)

        if "image" in module:
            stats["modulesWithImageCounter"] += 1

        repository_hoster = module["url"].split(".")[0].split("/")[2]
        if repository_hoster not in stats["repositoryHoster"]:
            stats["repositoryHoster"][repository_hoster] = 1
        else:
            stats["repositoryHoster"][repository_hoster] += 1

        if module["maintainer"] not in stats["maintainer"]:
            stats["maintainer"][module["maintainer"]] = 1
        else:
            stats["maintainer"][module["maintainer"]] += 1

        # Replace the issue array with the issue number. The issues were written to resuld.md and only the number of issues is relevant for the website. This reduces the size of modules.json by more than half.
        module["issues"] = len(module["issues"])

        # Just to reduce imbalance in the default sort order, modules from this developer get minimum one issue.
        if module['maintainer'] == "KristjanESPERANTO":
            if module["issues"] == 0:
                module["issues"] = 1

    print(
        f"{stats['moduleCounter']} modules analyzed. For results see file result.md.           ")

    # Prepearing the markdown output
    markdown_output = "# Result of the module analysis\n\n"
    markdown_output += f"Last update: {stats['lastUpdate']}\n\n"
    markdown_output += "## Statistics\n\n"
    markdown_output += "|                      | number   |\n"
    markdown_output += "|:---------------------|:--------:|\n"
    markdown_output += f"| modules analyzed     | {           stats['moduleCounter']:>6}   |\n"
    markdown_output += f"| maintainer           | {         len(stats['maintainer']):>6}   |\n"
    markdown_output += f"| modules with issues  | {stats['modulesWithIssuesCounter']:>6}   |\n"
    markdown_output += f"| issues               | {            stats['issueCounter']:>6}   |\n"

    for hoster, number in stats["repositoryHoster"].items():
        markdown_output += f"| modules at {hoster:9} | {                              number:>6}   |\n"

    markdown_output += "\n## Modules with issues\n"
    markdown_output += markdown_output_modules

    stats["maintainer"] = dict(
        sorted(stats["maintainer"].items(), key=lambda x: x[1], reverse=True)
    )

    # Writing to markdown
    with open("result.md", "w", encoding="utf-8") as outputfile:
        outputfile.write(markdown_output)

    # Serializing json
    json_object = json.dumps(modules, indent=2)

    # Writing to modules.json
    with open("./docs/data/modules.json", "w", encoding="utf-8") as outfile:
        outfile.write(json_object)

    # Serializing and minifying json
    json_object = json.dumps(modules)

    # Writing to modules.min.json
    with open("./docs/data/modules.min.json", "w", encoding="utf-8") as outfile:
        outfile.write(json_object)

    # Statistics
    # Serializing json
    statistics_json_object = json.dumps(stats, indent=2)

    # Writing to stats.json
    with open("./docs/data/stats.json", "w", encoding="utf-8") as outfile:
        outfile.write(statistics_json_object)


def get_last_commit_date(module, module_directory_path):
    """Function to get the last commit date."""
    module["lastCommit"] = (
        subprocess.run(
            f"cd {module_directory_path} && git log -1 --format='%aI' && cd .. && cd ..",
            stdout=subprocess.PIPE,
            shell=True,
            check=False,
        )
        .stdout.decode()
        .rstrip()
    )


def check_dependency_updates(module, module_directory_path):
    """
        Function to check if there are dependency updates.

        Because this is so time-consuming, we only do this for modules with a small number of issues.

        If there are only development updates, no issue will be created. 
    """
    package_json = Path(f"{module_directory_path}/package.json")
    if len(module["issues"]) < 2 and package_json.is_file():

        prod_updates_string = (
            subprocess.run(
                f"ncu --cwd {module_directory_path} --dep prod",
                capture_output=True,
                shell=True,
                check=False
            )
            .stdout.decode()
            .rstrip()
        )
        prod_updates_list = prod_updates_string.splitlines()
        prod_updates_list = [
            line for line in prod_updates_string if "→" in line]

        if len(prod_updates_list) > 0:

            updates_string = (
                subprocess.run(
                    f"ncu --cwd {module_directory_path}",
                    capture_output=True,
                    shell=True,
                    check=False
                )
                .stdout.decode()
                .rstrip()
            )
            updates_list = updates_string.splitlines()
            updates_list = [line for line in updates_list if "→" in line]

            issue_text = f"Information: There are updates for {len(updates_list)} dependencie(s):\n"
            for update in updates_list:
                issue_text += f"   -{update}\n"
            module["issues"].append(issue_text)


def check_branch_name(module, module_directory_path):
    """Function to check the branch name."""
    branch = (
        subprocess.run(
            f"cd {module_directory_path} && git branch && cd .. && cd ..",
            stdout=subprocess.PIPE,
            shell=True,
            check=False,
        )
        .stdout.decode()
        .rstrip()
    )
    if "* master" in branch:
        module["issues"].append(
            "The branch name is 'master'. Consider renaming it to 'main'.")


check_modules()
