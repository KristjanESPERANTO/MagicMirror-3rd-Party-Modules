#!/usr/bin/python3

import mimetypes
import subprocess
from pathlib import Path


def get_modules():
    with open("MagicMirror.wiki/3rd-Party-Modules.md", encoding="utf-8") as f:
        lines = f.readlines()

    MODULE_COUNTER = 0

    for line in lines:
        if "](https://github.com/" in line or "](https://gitlab.com/" in line:
            MODULE_COUNTER += 1
            columns = line.split("|")
            #if len(columns) == 5 and module_counter < 100:
            if len(columns) == 5:

                module_name = columns[1].split("(")[0].strip().replace("[", "").replace("]", "")
                module_url = columns[1].split("(")[1].strip().replace("(", "").replace(")", "")
                module_description = columns[3].strip()
                #module_packagejson_url_main = module_url.replace("github.com", "raw.githubusercontent.com") + "/master/package.json"
                print(
                    f"\n###############################################################################"
                    f"{MODULE_COUNTER:4}: {module_name}"
                    f"\n      {module_url}"
                    # f"\n      {module_packagejson_url_main}"
                    f"\n      {module_description}"
                )
                result = subprocess.run(["git","clone",f"{module_url}",f"modules/{MODULE_COUNTER:0>4}_{module_name}","--depth","1"])

                print(result)


def search_in_file(path, searchstring):
    try:
        with open(path, "r") as file:
            if searchstring in file.read():
                return True
    except UnicodeDecodeError:
        pass # Fond non-text data


def check_modules():
    search_strings = [
        "stylelint-config-prettier",
        #"electron-rebuild"
        #"Magic Mirror"
        #"node-fetch"
        #"XMLHttpRequest"
        ]

    all_modules_path = Path("./modules")
    for subfolder in sorted(all_modules_path.rglob("*")):
        if subfolder.is_dir():
            counter = 0
            #print(subfolder.name)
            dir_content = sorted(Path(subfolder).iterdir())
            for file_path in dir_content:
                if not file_path.is_dir() and not file_path.is_symlink() and ".min.js" not in str(file_path):
                    #print("****************************")
                    #print("####" + file_path.suffix + "####")
                    #print("\n ####  " + file_path.name + " ###### " + file_path.suffix)
                    # print("  " + str(dir(pathx)))
                    for searchstring in search_strings:
                        found_string = search_in_file(file_path, searchstring)
                        if found_string:
                            print(f"{subfolder.name}: found '{searchstring}' in file {file_path.name}")
                            counter += 1
            if counter > 0:
                print(f"{subfolder.name}: {counter}")

    # for p in path.rglob("*"):
    #    if p.is_dir():
    #        dir_content = sorted(Path(p).iterdir())
    #        for pathx in dir_content:
    #            if not pathx.is_dir():
    #                print(pathx.name)
    #                search_in_file(pathx, SEARCH_STRING)


get_modules()
check_modules()
