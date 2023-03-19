# MagicMirror Modules Checks

The aim is to check all MagicMirror modules listed on the website. This project is still in a very early stage. Feedback is very welcome.

## get_wiki.sh

This script fetches the wiki that contains the list of modules.

## check_modules.py

This module reads the module list and clones all modules so that they can then be checked.

## To do

- Create tests that are then displayed in an overview page (possibly Markdown).
  - check whether cloning is successful or not
  - is the module set to archived on Github? Is this visible during or after cloning?
    - if so, is it in the wiki?
  - When was the last commit
  - is there a package.json
    - is there a package-lock.json
    - `npm i` ok?
    - follow the recommended name: MMM-ModuleName ?
    - do they use prettier and linter?
    - do they use electron-rebuild -> PR @electron/rebuild
    - is "stylelint-config-prettier" in use? <https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/commit/2a6c26e42b71b3a34eb6acff48fd2b9de6ae6572>
    - Is node-fetch or an alternatives in use?
    - spelling "MagicMirror²". "Magic Mirror", "MagicMirror " ...
  - is depandabot there
    - monthly?
    - only production?
  - Is there a LICENCE file?
  - Is XMLHttpRequest in use?
  - Is 'https' in use (`require("https")` or `require('https')`)
