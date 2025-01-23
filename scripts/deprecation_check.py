import os
import subprocess


def check_deprecated_packages(directory_path):
    # print(f"Checking for deprecated packages in {directory_path}")

    if not os.path.exists(directory_path):
        print(f"Directory {directory_path} does not exist.")
        return

    package_json_file_path = os.path.join(directory_path, "package.json")
    if not os.path.exists(package_json_file_path):
        print(f"package.json does not exist in {directory_path}")
        return

    try:
        result = subprocess.run(
            "npx npm-deprecated-check current",
            cwd=directory_path,
            capture_output=True,
            shell=True,
            check=False
        )

        deprecated_packages = result.stderr.decode()

        if "There are no deprecated dependencies." in deprecated_packages:
            # print("No deprecated packages found.")
            return False
        else:
            # Remove all lines without the character : in deprecated_packages
            deprecated_packages = [
                line for line in deprecated_packages.splitlines() if ":" in line]
            # combine the list of strings into one string
            deprecated_packages = "\n".join(deprecated_packages)

            # print("Found deprecated package(s):")
            # print(deprecated_packages)
            return deprecated_packages

    except subprocess.CalledProcessError as error:
        print(f"Error: {error}")


# check_deprecated_packages("../modules/MMM-Button-----ptrbld")
