import os
import subprocess


def check_file_size_and_run_command(file_path: str):
    # Get the size of the file in bytes
    file_size = os.path.getsize(file_path)

    # Convert the minimum size to bytes (assuming it's in KB)
    min_size_bytes = 500 * 1024

    # If the file size is greater than or equal to the minimum size, run the command
    if file_size >= min_size_bytes:
        print(
            f'File is large enough, size is {file_size} bytes. \nRunning command to push new data to GitHub...')

        command = 'git add . && git commit -m "Update data" && git push origin main'

        # Explicitly define the value for 'check'
        subprocess.run(command, shell=True, check=True)

    else:
        print(
            f'File is too small, size is {file_size} bytes. Minimum size is {min_size_bytes} bytes')


# Usage
check_file_size_and_run_command(
    './website/data/modules.json')
