#!/usr/bin/python3
"""Function to get all MagicMirror² modules."""

import json
import requests
import shutil
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor


def validate_stage(stage_id, file_path):
    """Validate a stage artifact against its JSON schema."""
    result = subprocess.run(
        ["node", "scripts/validate_stage_json.js", stage_id, file_path],
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        details = "\n".join(
            message
            for message in (result.stdout.strip(), result.stderr.strip())
            if message
        )
        raise RuntimeError(
            f"Schema validation failed for {stage_id} ({file_path}):\n{details}"
        )


def get_modules():
    """Function to get all the modules per git."""

    module_counter = 0
    skipped_modules = []
    # For testing set this to a lower number to test only a few modules
    max_module_counter = 99999

    stage_input_path = "./website/data/modules.stage.2.json"
    validate_stage("modules.stage.2", stage_input_path)

    with open(stage_input_path, encoding="utf-8") as modules_json_file:
        modules_data = json.load(modules_json_file)

    if isinstance(modules_data, dict):
        modules = modules_data.get("modules")
        if modules is None:
            raise ValueError("modules.stage.2.json is missing the 'modules' property.")
    elif isinstance(modules_data, list):
        modules = modules_data
    else:
        raise TypeError(
            "modules.stage.2.json must contain either an object with a 'modules' property or a list of modules."
        )
    valid_modules = []

    # Validate URLs in parallel
    validated_modules = validate_urls(modules)

    for module, is_valid, status_code in validated_modules:
        if not is_valid:
            error = "Invalid repository URL"
            error_type = "invalid_url"
            print(f"- E - {error}: {module['url']}")
            skipped_entry = {
                "name": module["name"],
                "url": module["url"],
                "maintainer": module["url"].split("/")[3],
                "description": module.get("description", ""),
                "error": error,
                "errorType": error_type
            }
            skipped_modules.append(skipped_entry)
            continue

        # For valid modules, add issue note if 301
        if status_code == 301:
            module = module.copy()
            if "issues" not in module:
                module["issues"] = []
            module["issues"].append("The repository URL returns a 301 status code, indicating it has been moved. Please verify the new location and update the module list if necessary.")

        if module_counter < max_module_counter:
            module_counter += 1
            module_name = module["name"]
            module_url = module["url"]
            module_owner = module_url.split("/")[3]
            path = Path(f"./modules_temp/{module_name}-----{module_owner}")
            clone_successful = False

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
                    clone_successful = True
                except subprocess.CalledProcessError as e:
                    # If an error occurs while trying to pull the module, delete the module directory and re-run the git clone command
                    # An error like this can occur, for example, if the branch of the module has been changed.
                    print(
                        f"- E - An error occurred while trying to pull the module: {e}")
                    print(f"- I - Deleting the module directory: {path}")
                    shutil.rmtree(path)
                    print("- I - Re-running the git clone command")
                    result = subprocess.run(
                        f"git clone {module_url} {path} --depth 1", shell=True, capture_output=True, text=True, check=False
                    )
                    clone_successful = result.returncode == 0
            elif "branch" in module:
                print(f"- I - run `git clone --branch {module['branch']}` ")
                result = subprocess.run(
                    f"git clone --single-branch --branch {module['branch']} {module_url} {path} --depth 1", shell=True, capture_output=True, text=True, check=False
                )
                clone_successful = result.returncode == 0
            else:
                print("- I - path doesn't exists: run `git clone`")
                result = subprocess.run(
                    f"git clone {module_url} {path} --depth 1", shell=True, capture_output=True, text=True, check=True
                )
                clone_successful = result.returncode == 0

            if clone_successful:
                # Move module from temp directory to working directory
                try:
                    shutil.move(path, f"./modules/{module_name}-----{module_owner}")
                except Exception as e:
                    print(f"- E - Failed to move module directory: {e}")
                    clone_successful = False

            if not clone_successful:
                print(f"- E - Failed to clone/update module: {module_name}")
                skipped_modules.append({
                    "name": module_name,
                    "url": module_url,
                    "maintainer": module_owner,
                    "description": module.get("description", ""),
                    "error": "Repository clone failed - URL might be invalid or repository might be private/deleted",
                    "errorType": "clone_failure"
                })
            else:
                valid_modules.append(module)

    print(f"\n- I - Modules found and downloaded: {len(valid_modules)}")
    print(f"- W - Modules skipped due to errors: {len(skipped_modules)}\n")

    # Write skipped modules to separate file
    if skipped_modules:
        with open("./website/data/skipped_modules.json", "w", encoding="utf-8") as f:
            json.dump(skipped_modules, f, indent=2)

    # Write valid modules to next stage file
    stage_output_path = "./website/data/modules.stage.3.json"
    with open(stage_output_path, "w", encoding="utf-8") as f:
        json.dump({"modules": valid_modules}, f, indent=2)

    validate_stage("modules.stage.3", stage_output_path)


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


def is_valid_repo_url(url):
    """Checks if the repository URL is valid."""
    try:
        response = requests.head(url, allow_redirects=False, timeout=15)
        print(f"URL {url}: status {response.status_code}")
        return response.status_code in [200, 301], response.status_code
    except requests.RequestException as e:
        print(f"URL {url}: exception {e}")
        return False, None


def validate_urls(modules):
    """Validate all module URLs in parallel with simple progress output."""
    total = len(modules)
    progress = 0

    def validate_and_report(module):
        nonlocal progress
        is_valid, status_code = is_valid_repo_url(module["url"])
        result = (module, is_valid, status_code)
        progress += 1
        if progress % 10 == 0 or progress == total:
            print(f"- I - Progress: {progress}/{total} URLs validated")
        return result

    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(validate_and_report, modules))
    return results


rename_modules_directory()

get_modules()
