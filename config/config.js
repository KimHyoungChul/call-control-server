var path = require('path'),
    rootPath = path.normalize(__dirname + '/..'),
    env = process.env.NODE_ENV || 'development';
	console.log(env);


var config = {
  development: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 9443,
    http_uri: "https://localhost:9443/",
    ws_uri: "ws://demo.vietinterview.com:8888/kurento",
    security:
		{
			key:  './config/keys/server.key',
			cert: './config/keys/server.crt'
		}
  },

  test: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 9443,
    http_uri: "https://demo.vietinterview.com:9443/",
    ws_uri: "ws://demo.vietinterview.com:8888/kurento",
    security:
    	{
    		key: '/etc/letsencrypt/live/training.demo.vietinterview.com/privkey.pem',
    		cert: '/etc/letsencrypt/live/training.demo.vietinterview.com/fullchain.pem'
    	}
  },

  production: {
    root: rootPath,
    app: {
      name: 'call-control-server'
    },
    port: process.env.PORT || 9443,
    http_uri: "https://vietinterview.com:9443/",
    ws_uri: "wss://demo.vietinterview.com:8888/kurento",
    security:
    	{
    	   key: '/etc/letsencrypt/live/vietinterview.com/privkey.pem',
    	    cert: '/etc/letsencrypt/live/vietinterview.com/fullchain.pem'
    	}
  }
};

module.exports = config[env];
