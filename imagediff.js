const tmp = require('tmp');
const path = require('path');
const fs = require('fs');
const {spawn, execSync} = require('child_process');
const BlinkDiff = require('blink-diff');
const request = require('sync-request');

const EXCLUDED_REGIONS_FILE_NAME = 'excluded-regions.json';
const RESULT_FILE_NAME = 'result.json';
const CONSOLE_INIT_FILE = 'console.js';

const BASE_DIFF_TOOL_CONFIG = {
    thresholdType: BlinkDiff.THRESHOLD_PERCENT,
    threshold: 0.005,  // 0.5%

    outputBackgroundOpacity: 0.75,
    outputMaskOpacity: 1,

    // hide pixels that fit in the shift (less noise in the output)
    hideShift: true,

    verbose: true,
    debug: true
};

const Status = {
    IMAGES_SAME: 0,
    IMAGES_DIFFERENT: 1,
    UNKNOWN_ERROR: 2,
    IMAGE_NAMES_ARE_DIFFERENT: 3,
    PATHS_INCORRECT: 4,
    PATHS_COMBINATION_INCORRECT: 5,
    MULTIPLE_CONSOLES_RUNNING: 6,
    CONSOLE_UPDATE_ERROR: 7
};

const Mode = {
    WITH_CONSOLE: 0,
    NO_CONSOLE: 1
};

const Default = {
    PORT: 8008,
    ALIASING: 4,
    COLOR_DELTA: 75,
    MODE: Mode.WITH_CONSOLE
};

let messages = [];
let errorMessages = [];

function clearGlobalState() {
    messages = [];
    errorMessages = [];
}

function logError(error) {
    errorMessages.push(`${Date.now()}: ${error}`);
}

function log(message) {
    messages.push(`${Date.now()}: ${message}`);
}

// Traverse and collect all directories in the tree that are available for read
function findReadableDirs(dir) {
    const dirs = fs.readdirSync(dir)
        .map(file => path.join(dir, file))
        .filter(file => {
            try {
                fs.accessSync(file, fs.constants.R_OK);
                return fs.statSync(file).isDirectory();
            } catch (e) {
                return false;
            }
        });
    return [dir].concat(...dirs.map(d => findReadableDirs(d)));
}

function dirname(location) {
    if (fs.statSync(location).isDirectory()) {
        return location;
    }
    return path.dirname(location);
}

// Have different directories when running on Jenkins so we can archive the results
function createResultsDir() {
    if (process.env.WORKSPACE) {
        const resultsDirPath = path.join(process.env.WORKSPACE, 'imagediff-results-XXXXXX');
        return tmp.dirSync({template: resultsDirPath, discardDescriptor: true}).name;
    } else {
        return tmp.dirSync({discardDescriptor: true}).name;
    }
}

function createResponse(status) {
    return {status, messages, errorMessages};
}

// If there is no console running, start it, register results to an existing console otherwise
function updateConsole(config, results) {
    if (config.mode === Mode.NO_CONSOLE) {
        return;
    }

    const updateRunningInstanceOnly = Object.keys(results.diffs).length === 0;

    // store results as JSON so we can easily pass the context to the UI console
    fs.writeFileSync(config.resultsFilePath, JSON.stringify(results, null, 2));

    // it's expected the devs don't use Windows :)
    const consoleInstancesRunning = execSync('ps -ef')
        .toString().split('\n')
        .filter(line => ['node', CONSOLE_INIT_FILE].every(arg => line.indexOf(arg) >= 0))
        .length;

    if (consoleInstancesRunning === 0 && !updateRunningInstanceOnly) {
        spawn('node', [path.join(__dirname, CONSOLE_INIT_FILE), config.resultsFilePath, config.port], {
            detached: true,
            stdio: 'ignore'
        }).unref();
    } else if (consoleInstancesRunning === 1) {
        log(`Running Console process found. Updating results in the instance`);
        registerNewResultFile(config);
    } else if (consoleInstancesRunning > 1) {
        logError('Multiple running processes of Console found. Make sure only one / none Console processes are running.');
        throw new Error(Status.MULTIPLE_CONSOLES_RUNNING);
    }
}

function registerNewResultFile(config) {
    const response = request('POST', `http://localhost:${config.port}/register_results`, {
        headers: {'Content-Type': 'text/plain'},
        body: config.resultsFilePath
    });
    if (response.statusCode !== 200) {
        logError(response);
        throw new Error(Status.CONSOLE_UPDATE_ERROR);
    }
}

function compareImages(config) {
    const comparisonResults = [];

    let imagesToCompare = config.compareDirs ? findCapturedImages(config) : [path.basename(config.capturedPath)];
    imagesToCompare.forEach(imageName => {
        const baselineImage = path.join(dirname(config.baselinePath), imageName);
        const capturedImage = path.join(dirname(config.capturedPath), imageName);
        const diffImage = path.join(config.resultsDir, imageName);
        const result = compareImage(baselineImage, capturedImage, diffImage, imageName, config);
        comparisonResults.push(result);
    });

    const results = {
        diffs: comparisonResults.filter(r => r.code !== 5),  // remove identical images
        properties: {
            baselineDir: dirname(config.baselinePath),
            capturedDir: dirname(config.capturedPath),
            resultsDir: config.resultsDir
        },
        comparedImages: imagesToCompare.length
    };

    return results;
}

// Look only at captured images and compare them against the baseline, we don't care if baseline contains more images
function findCapturedImages(config) {
    const capturedImageNames = fs.readdirSync(config.capturedPath, {});
    return capturedImageNames.filter(fileName =>
        fs.lstatSync(path.join(config.capturedPath, fileName)).isFile() && fileName.toLowerCase().endsWith('png'));
}

function compareImage(baselineImage, capturedImage, diffImage, imageName, config) {
    let result = {code: 0};
    if (!fs.existsSync(baselineImage)) {
        logError(`Baseline image in location '${baselineImage}' is missing. Suggested solution is to create a new baseline from captured image '${capturedImage}'.`);
    } else {
        // configure and run diff tool
        const diffTool = new BlinkDiff({
            imageAPath: baselineImage,
            imageBPath: capturedImage,
            imageOutputPath: config.mode === Mode.WITH_CONSOLE ? diffImage : undefined,
            blockOut: loadExcludedRegions(config, imageName),
            ...BASE_DIFF_TOOL_CONFIG,
            hShift: config.aliasingPx,
            vShift: config.aliasingPx,
            delta: config.colorDelta
        });

        result = diffTool.runSync();
    }

    result.codeLabel = {0: 'not possible to compare', 1: 'different', 7: 'similar', 5: 'identical'}[result.code];
    result.fileName = imageName;

    return result;
}

function loadExcludedRegions(config, imageName) {
    try {
        const excludedRegions = JSON.parse(fs.readFileSync(path.join(dirname(config.baselinePath), EXCLUDED_REGIONS_FILE_NAME)));

        // wildcard that applies exclusion for all files - can be handy for progress bars that are in each page and so on
        const wildcardRegions = excludedRegions.hasOwnProperty('*') ? excludedRegions['*'] : [];
        const fileRegions = excludedRegions.hasOwnProperty(imageName) ? excludedRegions[imageName] : [];

        return [...fileRegions, ...wildcardRegions];
    } catch (e) {
        return [];
    }
}

function processConfiguration(config) {
    if (!fs.existsSync(config.baselinePath) || !fs.existsSync(config.capturedPath)) {
        logError(`Mandatory paths are missing or the location does not exist. Check documentation for details. Baseline path: '${config.baselinePath}', captured path: '${config.capturedPath}'.`);
        throw new Error(Status.PATHS_INCORRECT);
    }

    const baselineStat = fs.statSync(config.baselinePath);
    const capturedStat = fs.statSync(config.capturedPath);

    const internalOptions = {};
    if (baselineStat.isDirectory() && capturedStat.isDirectory()) {
        internalOptions.compareDirs = true;
    } else if (baselineStat.isFile() && capturedStat.isFile()) {
        internalOptions.compareDirs = false;

        if (path.basename(config.baselinePath) !== path.basename(config.capturedPath)) {
            logError(`Baseline '${config.baselinePath}' and captured '${config.capturedPath}' images must have the same name. Using different names will only cause you troubles when you compare full directories, not files only`);
            throw new Error(Status.IMAGE_NAMES_ARE_DIFFERENT);
        }
    } else {
        logError(`Baseline '${config.baselinePath}' and captured '${config.capturedPath}' paths must be both either directories or both direct images. Other combinations are not allowed.`);
        throw new Error(Status.PATHS_COMBINATION_INCORRECT);
    }

    internalOptions.resultsDir = createResultsDir();
    internalOptions.resultsFilePath = path.join(internalOptions.resultsDir, RESULT_FILE_NAME);

    return {
        ...internalOptions,
        baselinePath: config.baselinePath,
        capturedPath: config.capturedPath,
        port: config.port == null ? Default.PORT : parseInt(config.port),
        mode: config.mode == null ? Default.MODE : parseInt(config.mode),
        aliasingPx: config.aliasingPx == null ? Default.ALIASING : parseInt(config.aliasingPx),
        colorDelta: config.colorDelta == null ? Default.COLOR_DELTA : parseInt(config.colorDelta)
    };
}

function resultsToResponse(diffs, config) {
    if (Object.keys(diffs.diffs).length > 0) {
        logError(`Some images are different for directory '${config.capturedPath}'. Results are stored in: '${config.resultsDir}'`);

        if (config.mode === Mode.WITH_CONSOLE) {
            logError('Look at the console: http://localhost:' + config.port);
            logError(`To start the console manually, run the following command: 'node ${path.join(__dirname, CONSOLE_INIT_FILE)} ${config.resultsFilePath} ${config.port}'`);
        }

        return createResponse(Status.IMAGES_DIFFERENT);
    } else {
        if (diffs.comparedImages === 0) {
            log(`No images to compare in '${config.capturedPath}'`);
        } else {
            log(`All images in '${config.capturedPath}' are the same, you're good to go!`);
        }
        return createResponse(Status.IMAGES_SAME);
    }
}

function removeEmptyResultsDir(config) {
    const files = fs.readdirSync(config.resultsDir);
    if (files.length === 0) {
        fs.rmdirSync(config.resultsDir);
    }
}

function compareAndCreateResponse(config) {
    const results = compareImages(config);
    updateConsole(config, results);
    removeEmptyResultsDir(config);
    return resultsToResponse(results, config);
}

exports.compareImages = userConfig => {
    clearGlobalState();  // clear the state to prevent message duplication in repeated runs with the same instance
    try {
        const config = processConfiguration(userConfig);

        if (config.compareDirs) {
            const readableDirs = findReadableDirs(config.capturedPath);
            if (readableDirs.length === 1) {
                // there was no recursion we only search the directories we were given
                return compareAndCreateResponse(config);
            } else {
                // recursion happened - lets compose directories from baseline + captured and relative path underneath
                return readableDirs
                    .filter(dir => dir !== config.capturedPath)
                    .map(dir => path.relative(config.capturedPath, dir))
                    .map(dir => {
                        const newResultsDir = createResultsDir();
                        const newConfig = {
                            ...config,
                            baselinePath: path.join(config.baselinePath, dir),
                            capturedPath: path.join(config.capturedPath, dir),
                            resultsDir: newResultsDir,
                            resultsFilePath: path.join(newResultsDir, RESULT_FILE_NAME)
                        };
                        return compareAndCreateResponse(newConfig);
                    })
                    .reduce((result, response) => {
                        // In case we compare many directories and we get multiple errors, we cannot combine statuses
                        // so we pick the first failure status and we combine all error messages together
                        if (result.status === Status.IMAGES_SAME && response.status !== Status.IMAGES_SAME) {
                            result.status = response.status;
                        }
                        return result;
                    })
            }
        } else {
            return compareAndCreateResponse(config);
        }
    } catch (e) {
        const status = parseInt(e.message);
        if (!isNaN(status)) {
            return createResponse(status);
        }

        logError(e.message);
        return createResponse(Status.UNKNOWN_ERROR);
    }
};

exports.Status = Status;
exports.Mode = Mode;
exports.Default = Default;

/* tests-code */
exports.__test__ = {
    dirname, createResultsDir, findCapturedImages, loadExcludedRegions, processConfiguration
};
/* end-test-code */
