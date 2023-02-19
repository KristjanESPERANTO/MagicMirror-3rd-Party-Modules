#!/usr/bin/python3

import subprocess

with open("MagicMirror.wiki/3rd-Party-Modules.md") as f:
    lines = f.readlines()

module_counter = 0

for line in lines:
    if "](https://github.com/" in line:
        module_counter += 1
        columns = line.split("|")
        #if len(columns) == 5 and module_counter < 100:
        if len(columns) == 5:

            module_name = columns[1].split("(")[0].strip().replace("[", "").replace("]", "")
            module_url = columns[1].split("(")[1].strip().replace("(", "").replace(")", "")
            module_description = columns[3].strip()
            #module_packagejson_url_main = module_url.replace("github.com", "raw.githubusercontent.com") + "/master/package.json"
            print(
                f"{module_counter:4}: {module_name}"
                f"\n      {module_url}"
                # f"\n      {module_packagejson_url_main}"
                f"\n      {module_description}"
               
            )
            result = subprocess.run(["git","clone",f"{module_url}",f"modules/{module_counter:0>4}_{module_name}","--depth","1"])
            result
