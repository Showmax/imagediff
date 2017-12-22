const assert = require('assert');
const request = require('sync-request');
const path = require('path');
const {startConsole, waitForConsoleToFinishStartup, waitForShutdown, createResultFile, imageName, capturedDir, baselineDir} = require('./common');

const CONSOLE_PORT = 43219;
const CONSOLE_URL = `http://localhost:${CONSOLE_PORT}`;

function parseIdFromResultsPath(resultsPath) {
    return path.dirname(resultsPath).substring(resultsPath.lastIndexOf('-') + 1);
}

describe('ui console tests', function () {
    let configFile;
    let uiConsole;

    function assertResults(response, expectedNumberOfResults) {
        const body = JSON.parse(response.body);
        assert.equal(response.statusCode, 200, 'Unexpected response status');
        assert.equal(Object.keys(body).length, expectedNumberOfResults, `Unexpected number of results: ${response.body}`);
    }

    before('create default results file', function () {
        configFile = createResultFile(baselineDir, capturedDir);
    });

    beforeEach('start console', function () {
        uiConsole = startConsole(configFile, CONSOLE_PORT);
        return waitForConsoleToFinishStartup(CONSOLE_PORT);
    });

    afterEach('stop console', function () {
        uiConsole.kill(9);
        return waitForShutdown();
    });

    it("should return default data from '/excluded_regions' endpoint", function () {
        const response = request('get', `${CONSOLE_URL}/excluded_regions`, {
            qs: {
                id: parseIdFromResultsPath(configFile),
                fileName: imageName
            }
        });

        const body = JSON.parse(response.body);
        assert.equal(body.length, 1, `Unexpected number of excluded regions for '${imageName}'`);
    });

    it("should return default data from '/results' endpoint", function () {
        const response = request('get', `${CONSOLE_URL}/results`);
        assertResults(response, 1);
    });

    it("should return newly registered data from '/results' endpoint after registration over '/register_results'", function () {
        // just swap baseline/captured dirs to create 'new' unique combination of results and register the file
        request('post', `${CONSOLE_URL}/register_results`, {
            body: createResultFile(capturedDir, baselineDir),
            headers: {'Content-Type': 'text/plain'}
        });

        // now we should get more results than before
        const response = request('get', `${CONSOLE_URL}/results`);
        assertResults(response, 2);
    });

    it("should clear the default results when we send '/discard_captured'", function () {
        const discardResponse = request('post', `${CONSOLE_URL}/discard_captured`, {
            qs: {
                id: parseIdFromResultsPath(configFile),
                fileName: imageName
            }
        });

        assert.equal(discardResponse.statusCode, 200, 'Unable to discard default results from console');

        // double-check it really happened
        const resultsResponse = request('get', `${CONSOLE_URL}/results`);
        const body = JSON.parse(resultsResponse.body);
        assert.equal(Object.values(body).length, 1, 'Unexpected number of results');
        assert.equal(Object.values(body)[0].diffs.length, 0, 'Diffs were not discarded properly from results');
    });
});
