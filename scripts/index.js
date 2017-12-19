function stopConsole() {
    let request = new XMLHttpRequest();
    request.open('POST', '/stop_console', true);
    request.send();

    $('#main').hide();
    $('#header').hide();
    $('#consoleStopped').show();
}

function baselineCaptured(fileName) {
    sendPostAndReloadPage('/replace_baseline', fileName);
}

function discardCaptured(fileName) {
    sendPostAndReloadPage('/discard_captured', fileName);
}

function sendPostAndReloadPage(endpoint, body) {
    let request = new XMLHttpRequest();
    request.onreadystatechange = () => {
        if (request.readyState === XMLHttpRequest.DONE) {
            location.reload();
        }
    }
    request.open('POST', endpoint, true);
    request.send(body);
}