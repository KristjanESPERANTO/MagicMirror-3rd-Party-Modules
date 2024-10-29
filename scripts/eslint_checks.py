import json
import os
import subprocess

def eslint_check(directory_path):
    print(f"Run ESLint check in {directory_path}")

    if not os.path.exists(directory_path):
        return

    try:
        result = subprocess.run(
            f"npx eslint -f json -c eslint.testconfig.js {directory_path}",
            capture_output=True,
            shell=True,
            check=False
        )

        result_dict = json.loads(result.stdout)
        issue_list = []

        for entry in result_dict:
            file = entry["filePath"].split(str(directory_path))[1].strip("/")
            for message in entry["messages"]:
                issue_list.append(f"{file}: Line {message['line']}, Column {message['column']}: {message['message']} (rule: {message['ruleId']})")
        if len(issue_list) == 0:
            # print("No ESLint issues found.")
            return False
        return issue_list

    except subprocess.CalledProcessError as error:
        print(f"Error: {error}")


# eslint_check("modules/anniversarymodule-----marcomerens")
