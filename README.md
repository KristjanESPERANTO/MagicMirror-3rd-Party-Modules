# MagicMirror Modules Checks

The aim is to check all MagicMirror modules listed on the website. This project is still in a very early stage. Feedback is very welcome.

## get_wiki.sh

This script fetches the wiki that contains the list of modules.

## get_modules.py

This script reads the module list (created by the script before) and clones all modules.

## check_modules.py

This module goes through all cloned modules and performs various checks.

### Checks

- Are wrong spellings used?
  - "Magic Mirror" -> Change to "MagicMirror²"
  - "MagicMirror " (There may be false positives to this (for example in URLs).) -> Change to "MagicMirror²"
  - "`<sub>2</sub>`," -> Change to "²"
- Are deprecated modules used?
  - "stylelint-config-prettier" <https://stylelint.io/migration-guide/to-15/#deprecated-stylistic-rules> -> Update stylelint and remove this package
  - "request" -> replace later [1] by built-in fetch?
  - "node-fetch" -> replace later [1] by built-in fetch?
  - "https" -> replace later [1] by built-in fetch?
- Are deprecated/old functions used?
  - "XMLHttpRequest" -> replace later [1] by built-in fetch?

[1] Once node 18 is minimum requirement for MM.

## To do

- List the checks already implemented.
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
    - Is node-fetch or an alternatives in use?
  - is depandabot there
    - monthly?
    - only production?
  - Is there a LICENCE file?
