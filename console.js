const path = require('path');
const fs = require('fs');
const exphbs = require('express-handlebars');
const bodyParser = require('body-parser');
const express = require('express');
const app = express();

const results = JSON.parse(fs.readFileSync(process.argv[2]));
const port = parseInt(process.argv[3]);

app.use(bodyParser.text());

app.use('/baseline', express.static(results.properties.baselineDir));
app.use('/captured', express.static(results.properties.capturedDir));
app.use('/diffs', express.static(results.properties.resultsDir));

app.use('/scripts', express.static(__dirname + '/scripts'));
app.use('/scripts', express.static(__dirname + '/node_modules/zooming/build'));
app.use('/scripts', express.static(__dirname + '/node_modules/bootstrap/dist/js'));
app.use('/scripts', express.static(__dirname + '/node_modules/jquery/dist'));

app.use('/styles', express.static(__dirname + '/styles'));
app.use('/styles', express.static(__dirname + '/node_modules/bootstrap/dist/css'));

app.engine('hbs', exphbs({defaultLayout: 'single', extname: 'hbs'}));
app.set('view engine', 'hbs');

app.get('/', (req, res) => res.render('index', {
    layout: false,
    diffs: results.diffs,
    properties: results.properties
}));

app.post('/stop_console', (req, res) => process.exit(0));

function processDiffAction(req, res, fn) {
    const diffIndex = results.diffs.findIndex(diff => diff.fileName === req.body);
    fn(results.diffs[diffIndex]);
    delete results.diffs[diffIndex];
    res.send();
}

app.post('/replace_baseline', (req, res) => {
    processDiffAction(req, res, (diff) => fs.copyFileSync(path.join(results.properties.capturedDir, diff.fileName), path.join(results.properties.baselineDir, diff.fileName)))

});
app.post('/discard_captured', (req, res) => {
    processDiffAction(req, res, (diff) => {});
});

app.listen(port, () => console.log('Listening on port ' + port));
