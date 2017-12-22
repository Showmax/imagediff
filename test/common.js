const fs = require('fs');
const path = require('path');
const tmp = require('tmp');
const {spawn} = require('child_process');
const tcpie = require('tcpie');

const stderr = console.error;
const imageName = 'image.png';
const resourceDir = path.join(__dirname, 'resources');
const baselineDir = path.join(resourceDir, 'baseline');
const capturedDir = path.join(resourceDir, 'captured');

function turnOffStderr() {
    console.error = () => ({});
}

function turnOnStderr() {
    console.error = stderr;
}

function startConsole(configFile, port = 43210) {
    const console = spawn('node', [path.join(__dirname, '..', 'console.js'), configFile, port], {
        detached: true,
        stdio: 'ignore'
    });
    console.unref();
    return console;
}

function waitForConsoleToFinishStartup(port) {
    const pings = 5;
    return new Promise((resolve, reject) => {
        const ping = tcpie('localhost', port, {count: pings, interval: 250, timeout: 100});
        ping
            .on('connect', () => resolve())
            .on('error', () => ({}))
            .on('timeout', () => ({}))
            .on('end', stats => stats.failed === pings ? reject(`Console not started at http://localhost:${port}`) : resolve())
            .start();
    });
}

function waitForShutdown() {
    return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
}

function createResultFile(baselineDir, capturedDir) {
    const configFile = path.join(tmp.dirSync({discardDescriptor: true, mode: '0755'}).name, 'result.json');
    const config = {
        diffs: [{code: 1, fileName: imageName}],
        properties: {baselineDir, capturedDir, resultsDir: path.dirname(configFile)},
        excludedRegionsFile: path.join(baselineDir, 'excluded-regions.json')
    };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    return configFile;
}

module.exports = {
    turnOffStderr,
    turnOnStderr,
    startConsole,
    waitForConsoleToFinishStartup,
    waitForShutdown,
    createResultFile,
    imageName,
    resourceDir,
    baselineDir,
    capturedDir
}
