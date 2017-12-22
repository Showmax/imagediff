process.chdir(__dirname);

const path = require('path');
const fs = require('fs');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();

function parseIdFromResultsPath(resultsPath) {
    return path.dirname(resultsPath).substring(resultsPath.lastIndexOf('-') + 1);
}

function loadResults(resultsPath) {
    const results = JSON.parse(fs.readFileSync(resultsPath));
    results.id = parseIdFromResultsPath(resultsPath);
    results.excludedRegionsFile = path.join(results.properties.baselineDir, "excluded-regions.json");
    return {[results.id]: results};
}

function handleImageFileRequest(req, res, dirProperty) {
    res.sendFile(path.join(results[req.params.id].properties[dirProperty], req.params.fileName));
}

function handleDiffAction(req, res, fn) {
    const diffIndex = results[req.query.id].diffs.findIndex(diff => diff.fileName === req.query.fileName);
    fn(results[req.query.id].diffs[diffIndex]);
    results[req.query.id].diffs.splice(diffIndex, 1);
    res.sendStatus(200);
}

function resolveNodeModulesDir() {
    const nodeModulesDirName = 'node_modules';
    const nodeModulesDirIndex = __dirname.indexOf('node_modules');    
    
    if (nodeModulesDirIndex >= 0) {
        return __dirname.substring(0, nodeModulesDirIndex + nodeModulesDirName.length);
    } else {
        return path.join(__dirname, nodeModulesDirName);
    }
}

const resultsFilePath = process.argv[2];
const port = parseInt(process.argv[3]);
const nodeModulesDir = resolveNodeModulesDir();

let results = loadResults(resultsFilePath);

app.use(bodyParser.text());

app.use('/baseline/:id/:fileName', (req, res) => handleImageFileRequest(req, res, 'baselineDir'));
app.use('/captured/:id/:fileName', (req, res) => handleImageFileRequest(req, res, 'capturedDir'));
app.use('/diffs/:id/:fileName', (req, res) => handleImageFileRequest(req, res, 'resultsDir'));

app.use('/scripts', express.static(path.join(__dirname, 'scripts')));
app.use('/scripts', express.static(path.join(nodeModulesDir, 'zooming', 'build')));
app.use('/scripts', express.static(path.join(nodeModulesDir, 'bootstrap', 'dist', 'js')));
app.use('/scripts', express.static(path.join(nodeModulesDir, 'jquery', 'dist')));
app.use('/scripts', express.static(path.join(nodeModulesDir, 'jquery-select-areas')));

app.use('/styles', express.static(path.join(__dirname, '/styles')));
app.use('/styles', express.static(path.join(nodeModulesDir, 'jquery-select-areas', 'resources')));
app.use('/styles', express.static(path.join(nodeModulesDir, 'bootstrap', 'dist', 'css')));

app.engine('hbs', exphbs({defaultLayout: 'single', extname: 'hbs'}));
app.set('view engine', 'hbs');

app.get('/', (req, res) => res.render('index', {
    layout: false,
    results: Object.keys(results).filter(key => results[key].diffs.length > 0).map(key => results[key])
}));

app.get('/results', (req, res) => res.send(results));

app.get('/excluded_regions', (req, res) => {
    if (fs.existsSync(results[req.query.id].excludedRegionsFile)) {
        const config = JSON.parse(fs.readFileSync(results[req.query.id].excludedRegionsFile));
        if (config[req.query.fileName]) {
            res.send(config[req.query.fileName]);
            return;
        }
    }
    res.send("{}");
});

app.post('/excluded_regions', (req, res) => {
    const excludedRegionsFile = results[req.query.id].excludedRegionsFile;
    const currentRegions = fs.existsSync(excludedRegionsFile) ? JSON.parse(fs.readFileSync(excludedRegionsFile)) : {};

    // update regions for the file and persist it
    currentRegions[req.query.fileName] = JSON.parse(req.body);
    fs.writeFileSync(excludedRegionsFile, JSON.stringify(currentRegions, null, 2));
    res.sendStatus(200);
});

app.post('/stop_console', () => process.exit(0));

app.post('/replace_baseline', (req, res) => {
    handleDiffAction(req, res, diff =>
        fs.copyFileSync(
            path.join(results[req.query.id].properties.capturedDir, diff.fileName),
            path.join(results[req.query.id].properties.baselineDir, diff.fileName)))
});
app.post('/discard_captured', (req, res) => {
    handleDiffAction(req, res, () => ({}));
});

app.post('/register_results', (req, res) => {
    const newResults = loadResults(req.body);
    const newResultsProperties = Object.keys(newResults).map(key => newResults[key].properties)[0];

    // remove records for results created from the same directories so we don't pollute the console with obsolete stuff
    Object.keys(results)
        .filter(key => results[key].properties.baselineDir === newResultsProperties.baselineDir
            && results[key].properties.capturedDir === newResultsProperties.capturedDir)
        .forEach(key => delete results[key]);

    results = {...results, ...newResults};

    res.sendStatus(200);

    // stop console if there are no diffs remaining
    if (Object.keys(results).filter(key => results[key].diffs.length != 0).length === 0) {
        process.exit(0);
    }
});

app.listen(port, () => console.log('Listening on port ' + port));
