#!/usr/bin/python3
"""Function to get all MagicMirror modules."""

import subprocess


def get_modules():
    """Function to get all the modules per git."""
    with open("MagicMirror.wiki/3rd-Party-Modules.md", encoding="utf-8") as file:
        lines = file.readlines()

    module_counter = 0

    for line in lines:
        if "](https://github.com/" in line or "](https://gitlab.com/" in line:
            module_counter += 1
            columns = line.split("|")
            #if len(columns) == 5 and module_counter < 100:
            if len(columns) == 5:

                module_name = columns[1].split("(")[0].strip().replace("[", "").replace("]", "")
                module_url = columns[1].split("(")[1].strip().replace("(", "").replace(")", "")
                # module_description = columns[3].strip()
                print(
                    f"\n########   {module_counter:4}: {module_name}   ########"
                    f" {module_url}"
                    #f"\n      {module_description}"
                )
                result = subprocess.run(
                    ["git",
                     "clone",
                     f"{module_url}",
                     f"modules/{module_counter:0>4}_{module_name}",
                     "--depth",
                     "1"],
                    check=False)

                print(result)

get_modules()
