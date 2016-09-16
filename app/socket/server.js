var path = require('path');
var url = require('url');
var express = require('express');
var minimist = require('minimist');
var ws = require('ws');
var kurento = require('kurento-client');
var fs = require('fs');
var https = require('https');
var http = require('http');
var bodyParser = require('body-parser');
var _ = require('underscore');
var argv = minimist(process.argv.slice(2), {
    default: {
        //as_uri: 'https://training.demo.vietinterview.com:82/',
        as_uri: 'https://localhost:8443/',
        ws_uri: 'ws://training.demo.vietinterview.com:8888/kurento'
        //ws_uri: 'ws://192.168.1.52:8888/kurento'
    } 
    /*default: {
        as_uri: 'https://localhost:8443/',
        ws_uri: 'ws://192.168.1.52:8888/kurento'
    }*/
});

var options = {
    key: fs.readFileSync('keys/server.key'),
    cert: fs.readFileSync('keys/server.crt')
};

/*
var options = {
	    key: fs.readFileSync('/etc/letsencrypt/live/training.demo.vietinterview.com/privkey.pem'),
	    cert: fs.readFileSync('/etc/letsencrypt/live/training.demo.vietinterview.com/fullchain.pem')
	};*/
var memberList = [{
    name: 'Tran Manh Thang',
    role: 'presenter',
    userId: '9999',
    online: false,
    avail:false,
    invited:true,
    sessionId: null,
    ws: null,
    pipeline: null,
    webRtcEndpoint: null,
    candidateQueue: [],
    srcRtc: {}
}, {
    name: 'Quang',
    role: 'viewer',
    userId: '1234',
    online: false,
    avail:false,
    invited:false,
    sessionId: null,
    ws: null,
    pipeline: null,
    webRtcEndpoint: null,
    candidateQueue: [],
    srcRtc: {}
}, {
    name: 'Lanh',
    role: 'viewer',
    userId: '5678',
    online: false,
    avail:false,
    sessionId: null,
    invited:false,
    ws: null,
    pipeline: null,
    webRtcEndpoint: null,
    candidateQueue: [],
    srcRtc: {}
}, {
    name: 'Ngoc',
    role: 'viewer',
    userId: '1111',
    online: false,
    avail:false,
    sessionId: null,
    invited:false,
    ws: null,
    pipeline: null,
    webRtcEndpoint: null,
    candidateQueue: [],
    srcRtc: {}
}];

var presenter = _.find(memberList, function(m) {
    return m.role == 'presenter';
});

var app = express();
var idCounter = 0;
var candidatesQueue = {};
var kurentoClient = null;
var liveScoreWs = null;
/*
 * Server startup
 */
var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = https.createServer(options, app).listen(port, function() {
    console.log('Kurento Tutorial started');
    console.log('Open ' + url.format(asUrl) + ' with a WebRTC capable browser');
});
var wss = new ws.Server({
    server: server,
    path: '/conference'
});
/*
 * Management of WebSocket messages
 */
function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}
wss.on('connection', function(ws) {
    var sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);
    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        memberDisconnect(sessionId);
    });
    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        memberDisconnect(sessionId);
    });
    ws.on('message', function(_message) {
        var message = JSON.parse(_message);
         console.log('Connection ' + sessionId + ' received message ', message);
        switch (message.id) {
            case 'join':
                memberJoin(sessionId, ws, message.userId, function(success, sdpAnswer) {
                    if (!success) {
                        return ws.send(JSON.stringify({
                            id: 'joinResponse',
                            response: 'rejected',
                        }));
                    }
                    ws.send(JSON.stringify({
                        id: 'joinResponse',
                        response: 'accepted',
                        memberList: filterMemberProperty(memberList)
                    }));
                });
                break;
            case 'leave':
                memberLeave(message.userId);
                ws.send(JSON.stringify({
                    id: 'leaveResponse'
                }));
                break;
            case 'avail':
                memberAvail(message.userId);
                break;
            case 'end':
                endLesson();
                break;
            case 'handUp':
                if (presenter.ws)
                	presenter.ws.send(JSON.stringify({
                		id: 'handUp',
                		userId: message.userId
                	}));
                break;
            case 'handDown':
            	if (presenter.ws)
                	presenter.ws.send(JSON.stringify({
                		id: 'handDown',
                		userId: message.userId
                	}));
                break;
            case 'memberInvite':
            	memberInvite(message.memberId);
                break;
            case 'memberDiscard':
            	memberDiscard(message.memberId);
                break;
            case 'memberPublish':
                memberPublish(message.userId, ws, message.sdpOffer, function(success, sdpAnswer) {
                    if (!success) {
                        return ws.send(JSON.stringify({
                            id: 'memberPublishResponse',
                            response: 'rejected',
                        }));
                    }
                    ws.send(JSON.stringify({
                        id: 'memberPublishResponse',
                        response: 'accepted',
                        sdpAnswer: sdpAnswer
                    }));
                });
                break;
            case 'memberSubscribe':
               // console.log('Connection ' + sessionId + ' received message ', message);
                memberSubscribe(message.userId, message.sourceUserId, ws, message.sdpOffer, function(success, sdpAnswer) {
                    if (!success) {
                        return ws.send(JSON.stringify({
                            id: 'memberSubscribeResponse',
                            sourceUserId: message.sourceUserId,
                            response: 'rejected'
                        }));
                    }
                    ws.send(JSON.stringify({
                        id: 'memberSubscribeResponse',
                        response: 'accepted',
                        sdpAnswer: sdpAnswer,
                        sourceUserId: message.sourceUserId
                    }));
                });
                break;
            case 'onClientSendIceCandidate':
                onClientSendIceCandidate(message.userId, message.candidate);
                break;
            case 'onClientRecvIceCandidate':
                onClientRecvIceCandidate(message.userId, message.sourceUserId, message.candidate);
                break;
            case 'liveExam':
            	liveScoreWs = ws;
                break;
            default:
                ws.send(JSON.stringify({
                    id: 'error',
                    message: 'Invalid message ' + message.id
                }));
                break;
        }
    });
});
/*
 * Definition of functions
 */
// Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient != null) {
        return callback(true, kurentoClient);
    }
    kurento(argv.ws_uri, function(error, _kurentoClient) {
        if (error) {
            console.log("Could not find media server at address " + argv.ws_uri);
            return callback(false);
        }
        kurentoClient = _kurentoClient;
        callback(true, kurentoClient);
    });
}

function memberPublish(userId, ws, sdpOffer, callback) {
    var member = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    getKurentoClient(function(success, kurentoClient) {
        if (!success) {
            return callback(false);
        }
        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
                console.log(error)
                return callback(false);
            }
            member.pipeline = pipeline;
            pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
                if (error) {
                    console.log(error)
                    return callback(false);
                }
                member.webRtcEndpoint = webRtcEndpoint;
                _.each(member.candidateQueue,function(candidate) {
        			member.webRtcEndpoint.addIceCandidate(candidate);
        		});
                member.candidateQueue = [];
                
                webRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    ws.send(JSON.stringify({
                        id: 'serverSendIceCandidate',
                        candidate: candidate,
                        userId: member.userId
                    }));
                });
                webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
                    if (error) {
                        console.log(error)
                        return callback(false);
                    }
                    callback(true, sdpAnswer);
                    
                    
                    
                });
                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        console.log(error)
                        return callback(false);
                    }
                });
            });
        });
    });
}

function memberSubscribe(userId, sourceId, ws, sdpOffer, callback) {
    var viewer = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    var sourceUser = _.find(memberList, function(m) {
        return m.userId == sourceId;
    });
    if (!viewer || !sourceUser) {
    	 return callback(false);
    }
    viewer.srcRtc[sourceId] = {
        candidate: null,
        webRtcEndpoint: null
    };
    if (sourceUser.pipeline==null) {
        return callback(false);
    } 
    sourceUser.pipeline.create('WebRtcEndpoint', function(error, webRtcEndpoint) {
        if (error) {
            console.log(error)
            return callback(false);
        }
        viewer.srcRtc[sourceUser.userId].webRtcEndpoint = webRtcEndpoint;
        _.each(viewer.srcRtc[sourceUser.userId].candidateQueue,function(candidate) {
        	viewer.srcRtc[sourceUser.userId].webRtcEndpoint.addIceCandidate(candidate);
        });
        viewer.srcRtc[sourceUser.userId].candidateQueue = [];
        webRtcEndpoint.on('OnIceCandidate', function(event) {
            var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
            ws.send(JSON.stringify({
                id: 'serverRecvIceCandidate',
                candidate: candidate,
                sourceId: sourceUser.userId
            }));
        });
        webRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer) {
            if (error) {
                console.log(error)
                return callback(false);
            }
            sourceUser.webRtcEndpoint.connect(webRtcEndpoint, function(error) {
                if (error) {
                    console.log(error)
                    return callback(false);
                }
                callback(true, sdpAnswer);
                webRtcEndpoint.gatherCandidates(function(error) {
                    if (error) {
                        console.log(error)
                        return callback(false);
                    }
                });
            });
        });
    });
}

function onClientSendIceCandidate(userId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    var member = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    if (member.webRtcEndpoint)
    	member.webRtcEndpoint.addIceCandidate(candidate);
    else
    	member.candidateQueue.push( candidate);
}

function onClientRecvIceCandidate(userId, sourceUserId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    var member = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    var source = member.srcRtc[sourceUserId];
    if (source==null) {
        source = {
            candidateQueue: [candidate],
            webRtcEndpoint: null
        };
    } else {
    	if (source.candidateQueue)
    		source.candidateQueue.push( candidate);
    	else
    		source.candidateQueue = [candidate];
    }
    if (source.webRtcEndpoint) {
        console.info('Setting server-endpoint recv candidate');
        source.webRtcEndpoint.addIceCandidate(candidate);
    }
    member.srcRtc[sourceUserId] = source;
}

function broadcastStatus(sourceUserId) {
	_.each(memberList, function(m) {
        if (m.userId != sourceUserId && m.online && m.ws) {
            m.ws.send(JSON.stringify({
                id: 'memberStatus',
                memberList: filterMemberProperty(memberList)
            }));
        }
    });
}

function memberJoin(sessionId, ws, userId, callback) {
    var member = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    if (member==null || member.online) callback(false);
    else {
        member.online = true;
        member.avail = false;
        member.sessionId = sessionId;
        member.ws = ws;
        broadcastStatus(member.userId);
        callback(true);
    }
};

function filterMemberProperty(memberList) {
    return _.map(memberList, function(member) {
        return {
            name: member.name,
            userId: member.userId,
            online: member.online,
            invited: member.invited,
            avail: member.avail,
            role: member.role
        }
    })
}

function memberAvail(userId) {
    var member = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    if (member) {
        member.avail = true;
        broadcastStatus(member.userId);
    }
}

function memberLeave(userId) {
    var member = _.find(memberList, function(m) {
        return m.userId == userId;
    });
    if (member) {
        member.online = false;
        member.avail = false;
        releaseMember(member);
        broadcastStatus(member.userId);
    }
}

function memberDisconnect(sessionId) {
    var member = _.find(memberList, function(m) {
        return m.sessionId == sessionId;
    });
    if (member) {
        member.online = false;
        member.avail = false;
        releaseMember(member);
        broadcastStatus(member.userId);
    }
}

function memberInvite(memberId) {
    var member = _.find(memberList, function(m) {
        return m.userId == memberId;
    });
    member.invited = true;
    broadcastStatus(null);
}

function memberDiscard(memberId) {
    var member = _.find(memberList, function(m) {
        return m.userId == memberId;
    });
    member.invited = false;
    broadcastStatus(null);
}

function endLesson() {
    _.each(memberList, function(m) {
        releaseMember(m);
        if (m.online && m.ws) m.ws.send(JSON.stringify({
            id: 'endResponse'
        }));
    });
}

function releaseMember(member) {
    if (member.pipeline) member.pipeline.release();
    member.pipeline = null;
    if (member.webRtcEndpoint) member.webRtcEndpoint.release();
    member.webRtcEndpoint = null;
    for (var sourceUserId in member.srcRtc) {
        if (member.srcRtc[sourceUserId] && member.srcRtc[sourceUserId].webRtcEndpoint) member.srcRtc[sourceUserId].webRtcEndpoint.release();
        member.srcRtc = {};
    }
}
app.use(express.static(path.join(__dirname, 'static')));
app.use(bodyParser.json());
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.post('/member', function(req, res, next) {
    var member = req.body.member;
    member.srcRtc = {};
    member.candidateQueue = [];
    memberList.push(member);
    res.send(JSON.stringify(filterMemberProperty(memberList)));
});
app.get('/member', function(req, res, next) {
    res.send(JSON.stringify(filterMemberProperty(memberList)));
});

app.post('/liveExam', function(req, res, next) {
    var userId = req.body.userId;
    var score = req.body.score;
    res.send('Success');
    if (liveScoreWs) {
    	console.log('Try to update score');
    	try {
	    	liveScoreWs.send(JSON.stringify({
	             id: 'liveScore',
	             userId: userId,
	             score: score
	         }));
    	} catch (e) {
    		console.log(e);
    	}
    }
});