const {compareImages, Default} = require('./imagediff');

function runImageDiff(baselinePath, capturedPath, port = Default.PORT, mode = Default.MODE,
                      aliasingPx = Default.ALIASING, colorDelta = Default.COLOR_DELTA) {
    return compareImages({baselinePath, capturedPath, port, mode, aliasingPx, colorDelta});
}

function logAndExit(value) {


    if (value.errorMessages.length > 0) {
        // log normal messages alongside with error messages to get correct timeline
        const sortedByTimestamp = [...value.messages, ...value.errorMessages].sort();
        console.error(sortedByTimestamp.join("\n"));
    } else {
        console.log(value.messages.join("\n"));
    }
    process.exit(value.status);
}

const result = runImageDiff(...process.argv.slice(2, 8));
logAndExit(result);

