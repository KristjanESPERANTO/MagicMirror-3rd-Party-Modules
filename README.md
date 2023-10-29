# MagicMirror² Modules Checks

The aim is to check all [MagicMirror²](https://magicmirror.builders/) modules listed on [the official list in the wiki](https://github.com/MichMich/MagicMirror/wiki/3rd-party-modules).

You can see the result of the last analysis in [result.md](result.md).

This project is still in a very early stage. Feedback is very welcome.

## create_module_list.js

This script parses the list of modules from the wiki and writes it to a json file.

## get_modules.py

This script reads the module list (created by the script before) and clones all modules.

## expand_module_list_with_repo_data.js

This script expands the module list with information from the `package.json` files from the modules (if available).

The script also adds an image. To do this, it searches the module's repo for an image that begins with "screenshot". If it doesn't find anything like that, it takes the first image it finds in the repo.
Note: Images will only be included if a free license is specified in the `package.json`.

From the collected information it creates a new JSON file which can be used later for the module web page and possibly also for `MMM-Remote-Control`.

## check_modules.py

This script goes through all cloned modules and performs various checks. The result is writen to the [result.md](result.md). This script still not extends the modules list.

### Checks

Note: This list is not entirely up to date. See the code for current status.

- Are wrong spellings used?
  - "Magic Mirror" -> Change to "MagicMirror²"
  - "`<sub>2</sub>`," -> Change to "²"
- Are deprecated modules used?
  - "stylelint-config-prettier" <https://stylelint.io/migration-guide/to-15/#deprecated-stylistic-rules> -> Update stylelint and remove this package
  - "request" -> Maybe you can replace it with the internal fetch API.
  - "node-fetch" -> Maybe you can replace it with the internal fetch API.
  - "https" -> Maybe you can replace it with the internal fetch API.
- Are deprecated/old functions used?
  - "XMLHttpRequest" -> Maybe you can replace it with the internal fetch API.

## Ideas / To do

- Write instructions: “How do I get my module presented perfectly?”
- Purge the image folder at the start of script expand_module_list_with_repo_data.js to get rid of images from removed modules.
- handle/mark deprecated/unmaintained modules
- create super script which runs all scripts in the right order and shows a progress information
- rewite get_modules.py in javascript
- Get last commit date from git?
- Use modules.json for website
- Filter some keywords: MM, module, MagicMirror, Smart Miror, ...
- Compatibility with the module list of `MMM-Remote-Control`: <https://github.com/Jopyth/MMM-Remote-Control/blob/master/modules.json>
- Use data from GitHub API: <https://api.github.com/repos/MichMich/MagicMirror>
  - Unfortunately we can't make many API queries. That's why we try to get the most data without the API queries.
    Maybe we can build the API query into the website. E.g. a detail button for each module, which then opens a window with more details (like open issues and stars).
  - Is there also a GitLab API?
- Create test result overview (like a statistic).
- Statistics per module
  - last update date
  - number of unresolved issues to guess the module’s activation level or popularity
- Website
  - Make it responsive.
  - add sorting options alphabetically + last commit + GitHub stars + issues
- Also check MagicMirror² core.
- Tests
  - Is repository reachable? Now the get_modules skript interupts if a repo isn't reachable.
  - Is the module set to archived on GitHub/GitLab?
  - When was the last commit?
  - Is there a `package.json`?
    - Is there a `package-lock.json`?
    - `npm i` ok? _dangerous_, time consuming and storage consuming -> should be done in a container
    - Do they use prettier and linter?
  - Is depandabot there?
    - Is it set to monthly?
    - Only production?
  - Is `moment` in use? <https://momentjs.com/docs/#/-project-status/>
  - Is there a LICENCE file?
  - Is branch name master? -> Description why and how switch to main.
