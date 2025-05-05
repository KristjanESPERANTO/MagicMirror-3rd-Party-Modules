#!/usr/bin/python3
"""Function to get all MagicMirror² modules."""

import json
import shutil
import subprocess
from pathlib import Path


def get_modules():
    """Function to get all the modules per git."""

    module_counter = 0
    # For testing set this to a lower number to test only a few modules
    max_module_counter = 99999

    modules_json_file = open(
        "./docs/data/modules.stage.2.json", encoding="utf-8")
    modules = json.load(modules_json_file)

    for module in modules:
        if module_counter < max_module_counter:
            module_counter += 1
            module_name = module["name"]
            module_url = module["url"]
            module_owner = module_url.split("/")[3]
            path = Path(f"./modules_temp/{module_name}-----{module_owner}")

            print(
                f"\n+++   {module_counter:4}: {module_name} by {module_owner} - {module_url:4}"
                # f"\n      {module_description}"
            )

            if path.exists():
                # print("- I - path already exists: run `git pull`")
                try:
                    subprocess.run(
                        f"cd {path} && git pull && cd ..", shell=True, check=True
                    )
                except subprocess.CalledProcessError as e:
                    # If an error occurs while trying to pull the module, delete the module directory and re-run the git clone command
                    # An error like this can occur, for example, if the branch of the module has been changed.
                    print(
                        f"- E - An error occurred while trying to pull the module: {e}")
                    print(f"- I - Deleting the module directory: {path}")
                    shutil.rmtree(path)
                    print("- I - Re-running the git clone command")
                    try:
                        subprocess.run(
                            f"git clone {module_url} {path} --depth 1", shell=True, check=True
                        )
                    except Exception as error:
                        handle_clone_failure(module, error)
                        continue
            elif "branch" in module:
                print(f"- I - run `git clone --branch {module['branch']}` ")
                subprocess.run(
                    f"git clone --single-branch --branch {module['branch']} {module_url} {path} --depth 1", shell=True, check=False
                )
            else:
                print("- I - path doesn't exists: run `git clone`")
                try:
                    subprocess.run(
                        f"git clone {module_url} {path} --depth 1", shell=True, check=True
                    )
                except Exception as error:
                    handle_clone_failure(module, error)
                    continue

            # Move module from temp directory to working directory
            shutil.move(path, f"./modules/{module_name}-----{module_owner}")

    print("\n- I - Modules found and downloaded: " + str(module_counter) + "\n")

    with open("./docs/data/modules.stage.3.json", "w", encoding="utf-8") as f:
        json.dump(modules, f, ensure_ascii=False, indent=4)


def handle_clone_failure(module, error):
    error_message = str(f"- E - Failed to clone repository {module['url']}: {error}")
    print(error_message)
    module["issues"].append(error_message)
    module["status"] = "error"


def rename_modules_directory():
    """
    Deletes the directory "modules_temp" and renames the directory "modules" to "modules_temp".
    We need this so that we don't have to download all the git repositories every time.
    With rename process we get rid of old modules that have been removed from the list.
    """
    temp_path = Path("./modules_temp")
    modules_path = Path("./modules")

    if modules_path.exists():
        # Delete the directory "modules_temp" if it exists
        try:
            shutil.rmtree(str(temp_path))
        except FileNotFoundError:
            pass
        # Rename the directory "modules" to "modules_temp"
        shutil.move(str(modules_path), str(temp_path))


rename_modules_directory()

get_modules()
