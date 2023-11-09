# MagicMirror² Modules List & Checks

_This project is still in a early stage. Feedback and pull requests are very welcome._

The goals of this project are to **create a nice list of modules** for [MagicMirror²](https://magicmirror.builders/) and **do some rudimentary tests** on the modules (to generate suggestions for improvements for the developers).

## List of modules

[The official list in the wiki](https://github.com/MichMich/MagicMirror/wiki/3rd-party-modules) is a simple text list without filters and images. This list now contains over 1000 modules, so it is not so easy for users to pick out modules.

With a few scripts we create a web page with filter function and integrated images. This website still needs some fine tuning, but is already in a usable state. You can check it out here: <https://kristjanesperanto.github.io/MagicMirror-3rd-Party-Modules/>

## Module tests

The aim of the tests is to increase the quality of the modules, also in order to be able to present them optimally in the module list. Due to the huge number of modules, the tests can only remain rudimentary.

If you have ideas for further tests, you are welcome to create an issue or pull request. And if you as a developer do not like a test, you are welcome to give feedback or simply ignore the result.

The results of the tests you can see in the [result.md](result.md).

Here are some test results:

- _No image found._ - That means we will not have an image on the web page for this module.
- _package.json issue: No license field._ - No license field means no image on the web page (we can not use images without proper licence).
- _package.json issue: license should be a valid SPDX license expression_ - Incorrectly spelled license name means no image on the web page.
- _There is no `package.json`. We need this file to gather information about the module._ - We need information like the license and keywords.
- _Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`._
- _Deprecated: Found 'omxplayer' in file `node_helper.js`: Try to replace it with `vlc`._
- _Recommendation: Found 'node-fetch' in file `node_helper.js`: Replace it with built-in fetch._
- _Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module._
- _Typo: Found 'MagicMirror2' in file `README.md`: Replace it with `MagicMirror²`._
- _Recommendation: Found 'uses: actions/checkout@v3' in file `nodejs.yml`: Replace it with v4._
- _Deprecated: Found 'node-version: [16' in file `nodejs.yml`: Update to current version._

## Skripts

You can run all scripts in the right order by `npm run all`.

_Note_: Running all scripts requires a lot of time (> 10 min) and space on your hard drive (> 2 GB).

### create_module_list.js

This script parses the list of modules from the wiki and writes it to a json file.

### get_modules.py

This script reads the module list (created by the script before) and clones all modules.

_Note_: This script takes a long time (> 10 min) to download all modules and also takes up a lot of space on your hard drive (> 2 GB).

### expand_module_list_with_repo_data.js

This script expands the module list with information from the `package.json` files from the modules (if available).

The script also adds an image. To do this, it searches the module's repo for an image that begins with "screenshot" or "example". If it doesn't find anything like that, it takes the first image it finds in the repo.

_Note_: Images will only be included if a free license is specified in the `package.json`.

### check_modules.py

This script goes through all cloned modules and performs various checks. The result is written to the files [`result.md`](result.md) and [`modules.json`](./docs/modules.json).

## Ideas / To do

- Website
  - Add little statistics:
    - last update
    - module amount
    - amount of different maintainer
    - amount of modules with images
    - amount of GitHub repos
    - amount of GitLab repos
    - amount of bitbucket repos
  - Add filter for outdated modules.
- Write instructions: “How do I get my module presented perfectly in the list?”
- Handle empty keywords array + handle empty tags array (advise: Add a few meaningful terms to the keywords in the package.json. Not just “mirror” or “module”.)
- Use issue codes to make the module list file smaller.
- get rid of of the cloned repo files if a module is removed
- optimize progress information while running `npm run all`
- rewrite python scripts in javascript
- Compatibility with the module list of `MMM-Remote-Control`: <https://github.com/Jopyth/MMM-Remote-Control/blob/master/modules.json>
- Create test result overview (like a statistic).
- Statistics per module
  - last update date
  - number of unresolved issues to guess the module’s activation level or popularity
- Also run the tests on MagicMirror² core?
- Tests
  - Is repository reachable? Now the get_modules skript interupts if a repo isn't reachable.
  - If a module isn't marked as outdated, but has no commits since years: Check if the module is set to archived on GitHub/GitLab.
  - Is depandabot there?
    - Is it set to monthly?
    - Only production?
  - Is branch name master? -> Description why and how switch to main.

### Discarded ideas

- New test: Is `moment` in use? <https://momentjs.com/docs/#/-project-status/>.
  - `moment` is not really dead yet (it is no longer being developed, but it is still being maintained), so there is no urgent reason to change now. This is a test for the future when the Temporal API is ready.
- Use data from GitHub API: <https://api.github.com/repos/MichMich/MagicMirror>
  - Is there also a GitLab API? Yes, example: <https://gitlab.com/khassel/MMM-RepoStats/-/blob/master/node_helper.js?ref_type=heads#L116>
  - Unfortunately, the queries are blocked relatively quickly when we query information from each module via the API.
