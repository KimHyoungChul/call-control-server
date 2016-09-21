var path = require('path'),
    rootPath = path.normalize(__dirname + '/..'),
    env = process.env.NODE_ENV || 'development';
	console.log(env);
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
    //ws_uri: "ws://192.168.1.52:8888/kurento",
    ws_uri: "ws://demo.vietinterview.com:8888/kurento",
    security:
		{
			key:  fs.readFileSync('./config/keys/server.key'),
			cert: fs.readFileSync('./config/keys/server.crt')
		}
  },

  test: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 8443,
    db: 'mongodb://localhost/call-control-server-test',
    http_uri: "https://training.demo.vietinterview.com:8443/",
    ws_uri: "ws://training.demo.vietinterview.com:8888/kurento",
    security:
    	{
    		key: fs.readFileSync('/etc/letsencrypt/live/training.demo.vietinterview.com/privkey.pem'),
    		cert: fs.readFileSync('/etc/letsencrypt/live/training.demo.vietinterview.com/fullchain.pem')
    	}
  },

  production: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 9443,
    db: 'mongodb://localhost/call-control-server-production',
    http_uri: "https://vietinterview.com:9443/",
    ws_uri: "wss://demo.vietinterview.com:8888/kurento",
    security:
    	{
    	  // key: fs.readFileSync('/etc/letsencrypt/live/vietinterview.com/privkey.pem'),
    	 //   cert: fs.readFileSync('/etc/letsencrypt/live/vietinterview.com/fullchain.pem')
    	}
  }
};

module.exports = config[env];
