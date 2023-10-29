#!/usr/bin/python3
"""Function to get all MagicMirror² modules."""

import json
import shutil
import subprocess
from pathlib import Path


def get_modules():
    """Function to get all the modules per git."""

    module_counter = 0
    # For testing set this to a lower number to test only a few meodules
    max_module_counter = 99999

    modules_json_file = open('modules.json', encoding="utf-8")
    modules = json.load(modules_json_file)

    for module in modules:
        if module_counter < max_module_counter:
            module_counter += 1
            module_name = module["name"]
            module_url = module["url"]
            module_owner = module_url.split("/")[3]
            path = Path(f"./modules_temp/{module_name}-----{module_owner}")

            print(
                f"\n########   {module_counter:4}: {module_name} by {module_owner}"
                f"\n- I - {module_url:4}"
                # f"\n      {module_description}"
            )

            if path.exists():
                print("- I - path already exists: run `git pull`")
                subprocess.run(f"cd {path} && git pull && cd ..", shell=True, check=False)
            else:
                print("- I - path doesn't exists: run `git clone`")
                subprocess.run(f"git clone {module_url} {path} --depth 1", shell=True, check=False)
    print("\n- I - Modules found and downloaded: " + str(module_counter) + "\n")

def rename_modules_directory():
    """
    Deletes the directory "modules_temp" and renames the directory "modules" to "modules_temp".
    We need this so that we don't have to download all the git repositories every time.
    With rename process we get rid of old modules that have been removed from the list.

    NOTE/TODO: There is still a flaw in the system with this part. So far we are not getting rid of old modules.
    """
    temp_path = Path('./modules_temp')
    modules_path = Path('./modules')

    if (modules_path.exists()):
        # Delete the directory "modules_temp" if it exists
        try:
            shutil.rmtree(str(temp_path))
        except FileNotFoundError:
            pass
        # Rename the directory "modules" to "modules_temp"
        shutil.move(str(modules_path), str(temp_path))

def rename_modules_temp_directory_to_modules():
    """
    Rename the directory "modules_temp" to "modules"
    """
    shutil.move("modules_temp", "modules")

rename_modules_directory()

get_modules()

rename_modules_temp_directory_to_modules()
