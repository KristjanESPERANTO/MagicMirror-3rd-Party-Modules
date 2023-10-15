#!/usr/bin/python3
"""Function to get all MagicMirror² modules."""

import subprocess
from pathlib import Path

def get_modules():
    """Function to get all the modules per git."""
    with open("MagicMirror.wiki/3rd-Party-Modules.md", encoding="utf-8") as file:
        lines = file.readlines()

    module_counter = 0
    # For testing set this to a lower number to test only a few meodules
    max_module_counter = 99999

    for line in lines:
        if ("](https://github.com/" in line or "](https://gitlab.com/" in line) and module_counter < max_module_counter:
            module_counter += 1
            columns = line.split("|")

            if len(columns) == 5:

                module_name = columns[1].split("(")[0].strip().replace("[", "").replace("]", "")
                module_url = columns[1].split("(")[1].strip().replace("(", "").replace(")", "")
                module_owner = module_url.split("/")[3]
                # module_description = columns[3].strip()
                path = Path(f"./modules/{module_name}-----{module_owner}")

                print(
                    f"\n########   {module_counter:4}: {module_name} by {module_owner}"
                    f"\n- I - {module_url:4}"
                    #f"\n      {module_description}"
                )

                if path.exists():
                    print("- I - path already exists: run `git pull`")
                    subprocess.run(f"cd {path} && git pull && cd ..", shell=True, check=False)
                else:
                    print("- I - path doesn't exists: run `git clone`")
                    subprocess.run(f"git clone {module_url} {path} --depth 1", shell=True, check=False)
    print("\n- I - Modules found and downloaded: " + str(module_counter))
get_modules()
