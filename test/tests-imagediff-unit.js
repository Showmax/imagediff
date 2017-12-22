const assert = require('assert');
const path = require('path');
const fs = require('fs');
const tmp = require('tmp');
const {Default, Mode, Status, __test__} = require('./../imagediff');
const {capturedDir, baselineDir, imageName} = require('./common');

const tempDir = path.join(__dirname, '..', 'tmp');

before('create temp dir for arbitrary data', function () {
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
});

describe('imagediff unit tests', function () {
    describe('dirname()', function () {
        it('should return directory path of a directory (e.i. same as the input)', function () {
            assert.equal(__test__.dirname(__dirname), __dirname);
        });

        it('should return directory path of a file', function () {
            assert.equal(__test__.dirname(__filename), __dirname);
        });
    });

    describe('results dir', function () {
        it('should create results dir in some desired location', function () {
            process.env.WORKSPACE = path.join(__dirname, '..', 'tmp');
            const dirPath = __test__.createResultsDir();
            assert(fs.lstatSync(dirPath).isDirectory(), `Directory was not created in desired location '${dirPath}'`);
        });
    });

    describe('captured images', function () {
        it('should find captured images', function () {
            const images = __test__.findCapturedImages({capturedPath: capturedDir});
            assert.equal(images.length, 1, `Unexpected number of images found in '${capturedDir}'`);
            assert.equal(images[0], imageName, `Wrong image found in '${capturedDir}'`);
        });

        it('should not find any images', function () {
            const images = __test__.findCapturedImages({capturedPath: __dirname});
            assert.equal(images.length, 0, `Unexpected number of images found in ${__dirname}`);
        });
    });

    describe('excluded regions', function () {
        function testExcludedRegions(baselinePath, imageName, expectedNumberOfRegions) {
            const loadedRegions = __test__.loadExcludedRegions({baselinePath}, imageName);
            assert.equal(loadedRegions.length, expectedNumberOfRegions,
                `Unexpected number of excluded regions loaded from '${baselinePath}'`);
        }

        it('should load excluded regions for an existing file', function () {
            testExcludedRegions(baselineDir, imageName, 3);
        });

        it('should load excluded regions for a non-existing file', function () {
            testExcludedRegions(baselineDir, 'fakenews.png', 2);
        });

        it('should not load any excluded regions, the config file is missing', function () {
            testExcludedRegions(capturedDir, 'fakenews.png', 0);
        });
    });

    describe('user configuration processing', function () {
        it('should return default configuration', function () {
            const userConfig = {baselinePath: baselineDir, capturedPath: capturedDir};
            const config = __test__.processConfiguration(userConfig);
            assert.equal(config.port, Default.PORT, 'Default value not propagated for port');
            assert.equal(config.aliasingPx, Default.ALIASING, 'Default value not propagated for aliasing');
            assert.equal(config.colorDelta, Default.COLOR_DELTA, 'Default value not propagated for color delta');
            assert.equal(config.mode, Mode.WITH_CONSOLE, 'Default value not propagated for mode');
        });

        it('should return configuration with our custom values propagated', function () {
            const userConfig = {
                baselinePath: baselineDir,
                capturedPath: capturedDir,
                port: 1234,
                aliasingPx: 10,
                colorDelta: 255,
                mode: Mode.NO_CONSOLE
            };
            const config = __test__.processConfiguration(userConfig);
            assert.equal(config.port, 1234, 'Custom value not propagated for port');
            assert.equal(config.aliasingPx, 10, 'Custom value not propagated for aliasing');
            assert.equal(config.colorDelta, 255, 'Custom value not propagated for color delta');
            assert.equal(config.mode, Mode.NO_CONSOLE, 'Custom value not propagated for mode');
        });

        it('should fail creating a new configuration, image paths are not correct', function () {
            const config = {baselinePath: '/bad/path/1', capturedPath: '/bad/path/2'};
            assert.throws(() => __test__.processConfiguration(config), new RegExp(Status.PATHS_INCORRECT));
        });

        it('should fail creating a new configuration, image paths are not both dirs or both files', function () {
            const config = {baselinePath: baselineDir, capturedPath: path.join(baselineDir, imageName)};
            assert.throws(() => __test__.processConfiguration(config), new RegExp(Status.PATHS_COMBINATION_INCORRECT));
        });

        it('should set internal property that we want to compare dirs', function () {
            const config = __test__.processConfiguration({baselinePath: baselineDir, capturedPath: capturedDir});
            assert(config.compareDirs, `Compare dirs flag not set for config '${JSON.stringify(config)}'`);
        });

        it('should set internal property that we want to compare files only', function () {
            const fileName = path.join(baselineDir, imageName);
            const config = __test__.processConfiguration({baselinePath: fileName, capturedPath: fileName});
            assert(!config.compareDirs, `Compare dirs flag set (should not be) for config '${JSON.stringify(config)}'`);
        });
    });
});


