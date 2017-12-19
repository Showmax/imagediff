/*
TODO: loglevel lib
 */
const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const {spawn} = require('child_process');
const BlinkDiff = require('blink-diff');

function getPort() {
    if (process.argv.length >= 5) {
        return parseInt(process.argv[4]);
    } else {
        return 3000;
    }
}

const EXCLUDED_REGIONS_FILE_NAME = 'excluded-regions.json';
const RESULT_FILE_NAME = 'result.json';

const baselineDir = process.argv[2];
const capturedDir = process.argv[3];
const resultsDir = tmp.dirSync().name;
const port = getPort();

const baseDiffToolConfig = {
    thresholdType: BlinkDiff.THRESHOLD_PERCENT,
    threshold: 0.005,  // 0.5%

    outputBackgroundOpacity: 0.3,
    outputMaskRed: 213,

    blockOutOpacity: 1,
    blockOutGreen: 213,

    // little bit of space in comparison for aliasing (default is 2)
    // hShift: 5,
    // vShift: 5,

    // hide pixels that fit in the shift (less noise in the output)
    hideShift: true,

    verbose: true,
    debug: true
};

function spawnConsole(resultFileName) {
    spawn('node', ['./console.js', resultFileName, port], {detached: true, stdio: 'ignore'}).unref();
}

// look only at captured images and compare them against the baseline, we don't care if baseline contains more images
function findCapturedImages(capturedDirPath) {
    const capturedImageNames = fs.readdirSync(capturedDirPath, {});
    return capturedImageNames.filter(fileName => fs.lstatSync(path.join(capturedDirPath, fileName)).isFile());
}

function compareImages(baselineDir, capturedDir, resultsDir, capturedImageNames) {

    const results = {diffs: []};
    capturedImageNames.forEach(imageName => {
        const baselineImage = path.join(baselineDir, imageName);
        const capturedImage = path.join(capturedDir, imageName);
        const diffImage = path.join(resultsDir, imageName);

        // configure and run diff tool
        const diffTool = new BlinkDiff(Object.assign(baseDiffToolConfig, {
            imageAPath: baselineImage,
            imageBPath: capturedImage,
            imageOutputPath: diffImage
        }));
        try {
            const excludedRegions = JSON.parse(fs.readFileSync(path.join(baselineDir, EXCLUDED_REGIONS_FILE_NAME)));
            if (excludedRegions[imageName]) {
                diffTool.blockOut = excludedRegions[imageName];
            }
        } catch (e) {
            console.log("No region exclusion file found, comparing full area of the image");
        }

        const diff = diffTool.runSync();
        diff.codeLabel = {0: 'not possible to compare', 1: 'different', 7: 'similar', 5: 'identical'}[diff.code];
        diff.fileName = imageName;

        // add only diffs, we don't want to report identical images
        if (diff.code != 5) {
            results.diffs.push(diff);
        }
    });

    results.properties = {
        baselineDir: baselineDir,
        capturedDir: capturedDir,
        resultsDir: resultsDir
    };

    // store results as json so we can easily pass the context to the frontend
    fs.writeFileSync(path.join(resultsDir, RESULT_FILE_NAME), JSON.stringify(results, null, 2));

    return results;
}

process.chdir(__dirname);

const diffs = compareImages(baselineDir, capturedDir, resultsDir, findCapturedImages(capturedDir));
if (Object.keys(diffs.diffs).length > 0) {
    console.error('Diffs have been found. Look at the console: http://localhost:' + port);
    spawnConsole(path.join(resultsDir, RESULT_FILE_NAME));
    process.exit(1);
} else {
    console.log("No diffs have been found. You're good to go!");
    process.exit(0);
}
