

var express = require('express'),
  config = require('./config/config'),
  glob = require('glob'),
  url = require('url'),
  https = require('https'),
  ws = require('ws'),
  fs = require('fs');



var models = glob.sync(config.root + '/app/models/*.js');
models.forEach(function (model) {
  require(model);
});
var app = express();

require('./config/express')(app, config);


var http_uri = url.parse(config.http_uri);
var port = http_uri.port;
var security =
            {
                key:  fs.readFileSync(config.security.key),
                cert: fs.readFileSync(config.security.cert)
            }
var server = https.createServer(security, app).listen(port, function() {
    console.log('Open ' + url.format(config.http_uri) + ' with a WebRTC capable browser');
});

var one2oneWss = new ws.Server({
    server : server,
    path : '/one2one'
});



require('./app/socket/one2one').interview(one2oneWss);


