#!/usr/bin/python3
"""Function to run some checks to all downloaded modules."""

from pathlib import Path

def search_in_file(path, searchstring):
    """Function to search a string in a file."""
    try:
        with open(path, "r", encoding="utf-8") as file:
            if searchstring in file.read():
                return True
    except UnicodeDecodeError:
        pass # Fond non-text data


def check_modules():
    """Function to search a string in a file."""
    search_strings = [
        "stylelint-config-prettier", # Deprecated since stylint v15.
        "Magic Mirror", # to replace by "MagicMirror²"
        "MagicMirror2",
        "<sub>2</sub>,"
        "require(\"request\")", # to replace by built-in fetch
        "require('request')", # to replace by built-in fetch
        "require(\"https\")", # to replace by built-in fetch
        "require('https')", # to replace by built-in fetch
        "require('bent')", # to replace by built-in fetch
        "electron-rebuild", # to replace by @electron/rebuild
        "node-fetch", # to replace by built-in fetch
        "XMLHttpRequest", # to replace by built-in fetch
        "uses: actions/setup-node@v3", # to replace by v4
        "node-version: 14",
        "node-version: [14",
        "node-version: 16",
        "node-version: [16",
        "github/super-linter@" # to replace by github/super-linter/slim@
        ]

    all_modules_path = Path("./modules")
    for subfolder in sorted(all_modules_path.rglob("*")):
        if subfolder.is_dir():
            counter = 0
            issues = []
            #print(subfolder.name)
            dir_content = sorted(Path(subfolder).iterdir())
            for file_path in dir_content:
                if not file_path.is_dir() and not file_path.is_symlink() and ".min.js" not in str(file_path):
                    for searchstring in search_strings:
                        found_string = search_in_file(file_path, searchstring)
                        if found_string:
                            # print(f"{subfolder.name}: found '{searchstring}' in file {file_path.name}")
                            issues.append(f"{subfolder.name}: found '{searchstring}' in file {file_path.name}")
                            counter += 1
            if counter > 0:
                print(f"{subfolder.name}: {counter} - {subfolder}")
                for issue in issues:
                    print(issue)

check_modules()
