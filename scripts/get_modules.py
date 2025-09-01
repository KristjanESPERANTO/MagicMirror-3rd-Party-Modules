#!/usr/bin/python3
"""Function to get all MagicMirror² modules."""

import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict


def get_modules():
    """Function to get all the modules per git."""

    module_counter = 0
    # For testing set this to a lower number to test only a few modules
    max_module_counter = 99999

    modules_json_file = open(
        "./docs/data/modules.stage.1.json", encoding="utf-8")
    modules_data = json.load(modules_json_file)
    modules = modules_data.get("modules")

    # Try to read cached GitHub API data (created by updateRepositoryApiData.js).
    # This contains the last known commit (gitHubData.lastCommit) per repository id.
    repo_last_commit_map: Dict[str, str] = {}
    try:
        with open("./docs/data/gitHubData.json", encoding="utf-8") as fh:
            gh = json.load(fh)
            for repo in gh.get("repositories", []):
                rid = repo.get("id")
                last = repo.get("gitHubData", {}).get("lastCommit")
                if rid and last:
                    repo_last_commit_map[rid] = last
    except Exception:
        # No cached API data available; we'll fall back to existing behavior.
        repo_last_commit_map = {}

    for module in modules:
        if module_counter < max_module_counter:
            module_counter += 1
            module_name = module["name"]
            module_url = module["url"]
            module_owner = module_url.split("/")[3]
            path = Path(f"./modules_temp/{module_name}-----{module_owner}")

            # Derive a repository id (owner/repo) to look up lastCommit in the cached data.
            repo_id = module.get("id")
            if not repo_id:
                parts = module_url.rstrip(".git").split("/")
                if len(parts) >= 2:
                    repo_id = f"{parts[-2]}/{parts[-1]}"
                else:
                    repo_id = None

            print(
                f"\n+++   {module_counter:4}: {module_name} by {module_owner} - {module_url:4}"
                # f"\n      {module_description}"
            )

            if path.exists():
                # If we have cached API data with the last commit for this repo,
                # compare it to the local HEAD. If they match, skip network operations.
                skip_pull = False
                try:
                    if repo_id and repo_id in repo_last_commit_map:
                        local_last = (
                            subprocess.run(
                                f"cd {path} && git log -1 --format='%aI'", stdout=subprocess.PIPE, shell=True, check=False
                            ).stdout.decode().rstrip()
                        )
                        if local_last and local_last == repo_last_commit_map[repo_id]:
                            print("- I - Local repo up-to-date with cached API lastCommit; skipping git pull/clone")
                            skip_pull = True
                except Exception:
                    skip_pull = False

                if not skip_pull:
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
                        subprocess.run(
                            f"git clone {module_url} {path} --depth 1", shell=True, check=False
                        )
            elif "branch" in module:
                print(f"- I - run `git clone --branch {module['branch']}` ")
                subprocess.run(
                    f"git clone --single-branch --branch {module['branch']} {module_url} {path} --depth 1", shell=True, check=False
                )
            else:
                print("- I - path doesn't exists: run `git clone`")
                subprocess.run(
                    f"git clone {module_url} {path} --depth 1", shell=True, check=False
                )

            # Move module from temp directory to working directory
            shutil.move(path, f"./modules/{module_name}-----{module_owner}")

    print("\n- I - Modules found and downloaded: " + str(module_counter) + "\n")


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
