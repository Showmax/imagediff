const assert = require('assert');
const path = require('path');
const {startConsole, createResultFile, turnOffStderr, turnOnStderr, baselineDir, capturedDir, imageName} = require('./common');
const {compareImages, Status, Mode} = require('./../imagediff');

// Even though only few of these tests should be sufficient because we have most of it covered by unit tests, it does
// no harm, in this particular case, to have them all to be sure something in the middle is not broken by future changes.
describe('imagediff blackbox comparison tests', function () {

    function createConfig(baselinePath, capturedPath) {
        return {baselinePath, capturedPath, mode: Mode.NO_CONSOLE};
    }

    function assertStatus(result, status) {
        assert(result.status === status, `Result does not have expected status ${status}: ${JSON.stringify(result, null, 2)}`);
    }

    it(`should return status ${Status.IMAGES_SAME} for two same images`, function () {
        const imagePath = path.join(baselineDir, imageName);
        const result = compareImages(createConfig(imagePath, imagePath));
        assertStatus(result, Status.IMAGES_SAME);
    });

    it(`should return status ${Status.IMAGES_SAME} for two directories with same images`, function () {
        const result = compareImages(createConfig(baselineDir, baselineDir));
        assertStatus(result, Status.IMAGES_SAME);
    });

    it(`should return status ${Status.IMAGES_DIFFERENT} for two different images`, function () {
        const baselineImagePath = path.join(baselineDir, imageName);
        const capturedImagePath = path.join(capturedDir, imageName);
        const result = compareImages(createConfig(baselineImagePath, capturedImagePath));
        assertStatus(result, Status.IMAGES_DIFFERENT);
    });

    it(`should return status ${Status.IMAGES_DIFFERENT} for two directories with different images`, function () {
        const result = compareImages(createConfig(baselineDir, capturedDir));
        assertStatus(result, Status.IMAGES_DIFFERENT);
    });

    it(`should return status ${Status.IMAGES_DIFFERENT} if a baseline image is missing - dir comparison`, function () {
        const badBaselineDir = path.join(baselineDir, '..');
        const result = compareImages(createConfig(badBaselineDir, capturedDir));
        assertStatus(result, Status.IMAGES_DIFFERENT);
    });

    it(`should return status ${Status.PATHS_INCORRECT} if a baseline image is missing - file comparison`, function () {
        const baselineImagePath = path.join(baselineDir, 'bad_image.png');
        const capturedImagePath = path.join(capturedDir, imageName);
        const result = compareImages(createConfig(baselineImagePath, capturedImagePath));
        assertStatus(result, Status.PATHS_INCORRECT);
    });

    it(`should return status ${Status.IMAGE_NAMES_ARE_DIFFERENT} for image with different name`, function () {
        const baselineImagePath = path.join(baselineDir, imageName);
        const capturedImagePath = path.join(capturedDir, '..', 'backup', 'baseline_image.png');
        const result = compareImages(createConfig(baselineImagePath, capturedImagePath));
        assertStatus(result, Status.IMAGE_NAMES_ARE_DIFFERENT);
    });

    it(`should return status ${Status.PATHS_INCORRECT} for two incorrect paths`, function () {
        const result = compareImages(createConfig('/bad/path/1', '/bad/path/2'));
        assertStatus(result, Status.PATHS_INCORRECT);
    });

    it(`should return status ${Status.PATHS_INCORRECT} for even one incorrect path`, function () {
        const result = compareImages(createConfig('/bad/path/1', capturedDir));
        assertStatus(result, Status.PATHS_INCORRECT);
    });

    it(`should return status ${Status.PATHS_COMBINATION_INCORRECT} for one path being a directory and the second a file (not supported use case)`, function () {
        const result = compareImages(createConfig(path.join(baselineDir, imageName), capturedDir));
        assertStatus(result, Status.PATHS_COMBINATION_INCORRECT);
    });

    it(`should return status ${Status.UNKNOWN_ERROR} for two files that are not images`, function () {
        // Diff library in this comparison pollutes stderr, disable it for a moment so we get cleaner test output,
        // error message is captured in the result anyway, no need to have it printed randomly in the result list
        turnOffStderr();
        const result = compareImages(createConfig(__filename, __filename));
        turnOnStderr();
        assertStatus(result, Status.UNKNOWN_ERROR);
    });

    it(`should return status ${Status.MULTIPLE_CONSOLES_RUNNING} if there are already multiple consoles running`, function () {
        const consoles = [
            startConsole(createResultFile(baselineDir, capturedDir)),
            startConsole(createResultFile(baselineDir, capturedDir), 43211)
        ];
        try {
            const config = {...createConfig(baselineDir, capturedDir), mode: Mode.WITH_CONSOLE};
            const result = compareImages(config);
            assertStatus(result, Status.MULTIPLE_CONSOLES_RUNNING);
        } finally {
            consoles.forEach(c => c.kill(9));
        }
    });
});
