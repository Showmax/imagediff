# ImageDiff

Tool for image comparison. Features:
* UI console showing differences, allowing user to make captured images a new baseline
* ability to exclude dynamic areas of images that should not be compared
 
> Note that for now we only support PNG images

## Prerequisites

`node` and `npm` packages have to be installed on the system, they are used by the tool.

Node `8.6.0+` is required, check https://nodejs.org/en/download/package-manager/#debian-and-ubuntu-based-linux-distributions for installation details.

It is recommended to use Git LFS to version images. Download and install the package https://git-lfs.github.com/, then run `git lfs install` in your git project. If you had pulled the changes from LFS before you installed the Git LFS, run `git lfs pull` to download the linked files. From this moment, you're good to go.

## Installation

```
npm install 
```

## Usage

### Standalone
You need to capture stdout, stderr and process status code if you need to receive any results from it.

```js
node runner.js <directory with baseline images> <directory with captured images> [UI console port] [mode] [aliasing px] [color delta]
```

### Direct usage from NPM package

```js
const {compareImages, Status, Mode, Default} = require('@showmax/imagediff');
const options = { baselinePath: '/path', capturedPath: '/path', port: 8008, mode: Mode.WITH_CONSOLE, aliasingPx: 4, colorDelta: 75 }
const result = compareImages(options);  

if (result.status !== Status.IMAGES_SAME) {
    // handle error
}
```

### Options (for standalone / direct usage of imagediff)
* **all paths must be absolute**
* `baselinePath`: directory where all 'template' images are stored or an image path
* `capturedPath`: directory where you save screenshots during a test run or an image path
* `[port]`: port for UI console which opens in case there is a difference between captured and baselined images (default: 8008)
* `[mode]`: default mode `Mode.WITH_CONSOLE` starts a UI console each time a diff is found, the other option is `MODE_NO_CONSOLE` which simply compares images and returns the result
* `[aliasingPx]`: area of surrounding pixels that are treated less strictly then usual, handy when for example browsers render fonts a little bit differently (default: 4)
* `[colorDelta]`: allowed difference of color (in RGB colorspace) that is not considered as image difference (values in range 0-255, default: 75)

Value returned in direct usage is an object with the following properties
* `status`
* `messages`: debug messages for triage
* `errorMessages`: error messages (can be empty)

### Status codes
For most recent status codes, see the source code - `Status` object.  

### Results
By default, all results are stored in system's `/tmp/tmp-***********` dir. But for convenience, if there is a `WORKSPACE` env variable, it's used instead and results are stored in `$WORKSPACE/imagediff-results-******`. This may be handy especially when running the comparison on Jenkins with intention to archive artifacts.


### Exclusion of certain parts of an image

This can be handy if your screenshot contains areas that are different every time you take it (time / date / username / ...). In such case you want don't want to include these parts when comparing images.

The configuration is pretty simple. For each test case (e.i. bunch of screenshots for one flow), you create a `excluded-regions.json` file in the directory where image is located (usually the test case directory). The content is as follows:

```json
{
  "image-name.png": [
    {
      "x": 10,
      "y": 10,
      "width": 50,
      "height": 50
    }
  ],
  "*": [
    {
      "x": 10,
      "y": 10,
      "width": 50,
      "height": 50
    }
  ]
}
```

So basically you specify top-left coordinates of a rectangle and its dimensions to create excluded area. You can have as many areas per one image as you want.

In case you have all screenshots with dynamic area in the same place (e.g. part of header, footer, ...) you can use a wildcard character `*` which then applies defined exclusions to all files in the directory (together with exclusions for a particular file).

> If you don't want to configure the coordinates manually in the file, you can use the UI console for it. 

## Baseline Recommendations

Even though it's up to you how you store baseline screenshots, the recommended way is to have the following directory structure:

```
baseline
├── < environment name - e.g. browserstack/chrome/... >
│   └── < test case name - e.g. sign_in >
│       ├── 0001-screen1.png
│       ├── 0001-screen2.png
│       └── excluded-regions.json
│
└── chrome
    ├── adds_recurrent_credit_card_with_new_layout
    │   ├── 0001-payment_methods.png
    │   └── 0002-cc_form_filled.png
    └── adds_recurrent_credit_card_with_old_layout
        ├── 0001-payment_methods.png
        └── 0002-cc_form_filled.png

```

To sum it up, the structure is: `environment -> test case -> screenshots`. Following this recommendation will give you clearer results. 
