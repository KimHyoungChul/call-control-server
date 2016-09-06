var path = require('path'),
    rootPath = path.normalize(__dirname + '/..'),
    env = process.env.NODE_ENV || 'development';
var fs = require('fs');

var config = {
  development: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 8443,
    db: 'mongodb://localhost/call-control-server-development',
    http_uri: "https://localhost:8443/",
    ws_uri: "ws://192.168.1.52:8888/kurento",
    security:
		{
			key:  fs.readFileSync('config/keys/server.key'),
			cert: fs.readFileSync('config/keys/server.crt')
		}
  },

  test: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 8443,
    db: 'mongodb://localhost/call-control-server-test',
    http_uri: "https://demo.vietinterview.com:8443/",
    ws_uri: "ws://demo.vietinterview.com:8888/kurento",
    security:
    	{
    		key:  fs.readFileSync('config/keys/server.key'),
    		cert: fs.readFileSync('config/keys/server.crt')
    	}
  },

  production: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 8443,
    db: 'mongodb://localhost/call-control-server-production',
    http_uri: "https://vietinterview.com:8443/",
    ws_uri: "ws://vietinterview.com:8888/kurento"
  }
};

module.exports = config[env];
