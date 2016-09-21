

var express = require('express'),
  config = require('./config/config'),
  glob = require('glob'),
  mongoose = require('mongoose'),
  url = require('url'),
  https = require('https'),
  ws = require('ws');


/*mongoose.connect(config.db);
var db = mongoose.connection;
db.on('error', function () {
  throw new Error('unable to connect to database at ' + config.db);
});*/

var models = glob.sync(config.root + '/app/models/*.js');
models.forEach(function (model) {
  require(model);
});
var app = express();

require('./config/express')(app, config);


var http_uri = url.parse(config.http_uri);
var port = http_uri.port;
var server = https.createServer(config.security, app).listen(port, function() {
    console.log('Open ' + url.format(config.http_uri) + ' with a WebRTC capable browser');
});

var one2oneWss = new ws.Server({
    server : server,
    path : '/one2one'
});

var one2manyWss = new ws.Server({
    server : server,
    path : '/one2many'
});

//require('./app/socket/one2one').interview(one2oneWss);
require('./app/socket/one2many').conference(one2manyWss);


