# This script clones or updates the MagicMirror.wiki repo.

import os

# Check if the directory "MagicMirror.wiki" already exists
if os.path.exists("MagicMirror.wiki"):
    # If the directory exists, change into the directory
    os.chdir("MagicMirror.wiki")
    # Discard local changes, if any
    os.system("git checkout .")
    # Perform a forced `git pull` to update the repository
    os.system("git pull --force")
else:
    # If the directory doesn't exist, clone the Git repository
    os.system("git clone https://github.com/MichMich/MagicMirror.wiki")
