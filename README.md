# MagicMirror² Modules List & Checks

The goals of this project are to **create a nice looking and useful list of modules** for [MagicMirror²](https://magicmirror.builders/) and to **do some rudimentary testing** of the modules (to generate improvement suggestions for the developers).

Feedback and pull requests are very welcome.

## List of modules

[The original list in the wiki](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-party-modules) is a simple text list without filters and images. This list now contains over 1000 modules, so it is not so easy for users to pick out modules.

Based on the original list, we automatically create a website with filter functions and integrated images. You can check it out here: <https://modules.magicmirror.builders/>

### How do I get my module presented in the new list?

Add your module to [the original list in the wiki](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-party-modules). Once a day the new list will be updated based on the original list.

### How do I get my module presented perfectly in the new list?

This is a list of information that we can display on the web page and where the information comes from. This should help you to improve the presentation of your module. Keep in mind that the web page will not be updated immediately, it may take a few days for your changes to arrive.

- Module name: Is taken from the repository URL. Example URL: <https://github.com/maintainer/MMM-MyFancyModule> -> module name `MMM-MyFancyModule`.
- Maintainer: Is also taken from the repository URL. Example URL: <https://github.com/BruceWayne/MMM-MyFancyModule> -> maintainer `BruceWayne`.
- Last commit: It's taken directly from the repository.
- Image
  - There are two requirements for an image of your module to be displayed:
    1. There must be a LICENSE file with a free license or in the `package.json` must be a free license in the license field. Take a look at [this package.json](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/blob/main/package.json) as an example.
    2. There must be an image file in your repository.
  - If there are several images in your repository, one image is selected according to the following logic: First search for an image that contains 'screenshot' or 'example' in it's name and if none is found, take the first image that is found.
- Description: Is taken from the [official list of modules](https://github.com/MagicMirrorOrg/MagicMirror/wiki/3rd-party-modules).
- Tags: Are taken from the keywords in the `package.json`. Take a look at [this package.json](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/blob/main/package.json) as an example.
- License: Is taken from the keywords in the `package.json`. Take a look at [this package.json](https://github.com/KristjanESPERANTO/MMM-PublicTransportHafas/blob/main/package.json) as an example.

Also check the [result file](./website/result.md) to see if there are any notes on your module.

## Module tests

The aim of the tests is to increase the quality of the modules, also in order to be able to present them optimally in the module list. Due to the huge number of modules, the tests can only remain rudimentary.

If you have ideas for further tests, you are welcome to create an issue or pull request. And if you as a developer do not like a test, you are welcome to give feedback or simply ignore the result.

The results of the tests you can see in the [`result.html`](https://modules.magicmirror.builders/result.html).

Here are some test results:

- _No image found._ - That means we will not have an image on the web page for this module.
- _package.json issue: No license field._ - No license field means no image on the web page (we can not use images without proper license).
- _package.json issue: license should be a valid SPDX license expression_ - Incorrectly spelled license name means no image on the web page.
- _There is no `package.json`. We need this file to gather information about the module._ - We need information like the license and keywords.
- _Found directory `node_modules`. This shouldn't be uploaded. Add `node_modules/`to `.gitignore`._
- _Deprecated: Found 'omxplayer' in file `node_helper.js`: Try to replace it with `vlc`._
- _Recommendation: Found 'node-fetch' in file `node_helper.js`: Replace it with built-in fetch._
- _Recommendation: Module name doesn't follow the recommended pattern (it doesn't start with `MMM-`). Consider renaming your module._
- _Typo: Found 'MagicMirror2' in file `README.md`: Replace it with `MagicMirror²`._
- _Recommendation: Found 'uses: actions/checkout@v3' in file `nodejs.yml`: Replace it with v4._
- _Deprecated: Found 'node-version: [16' in file `nodejs.yml`: Update to current version._
- _Issue: The license in the package.json (ISC) doesn't match the license file (MIT)._

## Contributor Guide

Contributor setup instructions—including required runtimes and installation steps—now live in the [Contributing Guide](docs/CONTRIBUTING.md). Casual readers can skip straight to the module catalogue.

## Ideas / To do

See [GitHub issues](https://github.com/MagicMirrorOrg/MagicMirror-3rd-Party-Modules/issues) for ideas and tasks.

### Templates for the creation of issues

- Missing keywords: <https://github.com/BrianHepler/MMM-BirdNET/issues/6>
- Missing `package.json`: <https://github.com/elliefairholm/on-this-day/issues/10>
- Missing license file: <https://github.com/grabenhenrich/MMM-Space/issues/1>
- Missing screenshot: <https://github.com/randomBrainstormer/MMM-GoogleCalendar/issues/60>
- Move screenshot to repository: <https://github.com/joschi27/MMM-flatastic/issues/3>
- Reference to the check results: <https://github.com/Fabrizz/MMM-OnSpotify/issues/48>

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE.md) file for details.
