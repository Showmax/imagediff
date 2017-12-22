function constructEndpointPath(endpoint, queryParams) {
    if (queryParams == null || queryParams.length == 0) {
        return endpoint;
    }
    return `${endpoint}?${Object.keys(queryParams).map(key => `${key}=${encodeURIComponent(queryParams[key])}`).join('&')}`;
}

function sendRequest(method, endpoint, queryParams, body) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.addEventListener('readystatechange', () => {
            if (request.readyState === XMLHttpRequest.DONE) {
                if (request.status === 200) {
                    resolve(request);
                } else {
                    reject(request);
                }
            }
        });
        request.addEventListener('error', () => reject(request));
        request.addEventListener('abort', () => reject(request));
        request.open(method, constructEndpointPath(endpoint, queryParams), true);
        request.send(body);
    });
}

function sendGet(endpoint, queryParams) {
    return sendRequest('GET', endpoint, queryParams);
}

function sendPost(endpoint, queryParams, body) {
    return sendRequest('POST', endpoint, queryParams, body);
}

function sendPostAndReloadPage(endpoint, queryParams, body) {
    sendPost(endpoint, queryParams, body).then(() => location.reload()).catch(() => alertFail());
}

function baselineCaptured(id, fileName) {
    sendPostAndReloadPage('/replace_baseline', {id, fileName});
}

function discardCaptured(id, fileName) {
    sendPostAndReloadPage('/discard_captured', {id, fileName});
}

function loadExcludedRegions(id, fileName) {
    return sendGet('/excluded_regions', {id, fileName});
}

function updateExcludedRegions(id, fileName, regions) {
    sendPost('/excluded_regions', {id, fileName}, regions).then(() => alertSuccess()).catch(() => alertFail());
}

function alert(id) {
    $(id).fadeTo(2000, 500).slideUp(500, () => $(id).slideUp(500));
}

function alertFail() {
    alert('#actionFailed');
}

function alertSuccess() {
    alert('#actionSuccessful');
}

function stopConsole() {
    sendPost('/stop_console').then(() => ({})).catch(() => {
        $('#main').hide();
        $('#header').hide();
        $('#consoleStopped').show();
    });
}

$(document).ready(() => {
    $('#actionSuccessful').hide();
    $('#actionFailed').hide();
    $('#consoleStopped').hide();

    $('.openExcludeDialog').on('click', function () {
        const fileName = $(this).data('file');
        const id = $(this).data('id');
        const image = $('<img />', {src: `/captured/${id}/${fileName}`});

        loadExcludedRegions(id, fileName).then(request => {
            $('#excludeImageContainer').empty();
            $('#excludeImageContainer').append(image);
            image.selectAreas({
                minSize: [10, 10],
                areas: JSON.parse(request.responseText)
            })
        }).catch(() => alertFail());

        $('#saveExcludes').off('click');
        $('#saveExcludes').on('click', function () {
            // do not use all the properties from the region selection framework, pick only the ones we actually need
            const regions = image.selectAreas('areas').map(r => ({
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height
            }));
            updateExcludedRegions(id, fileName, JSON.stringify(regions));
        });
    });
});
