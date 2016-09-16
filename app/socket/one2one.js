var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var kurento = require('kurento-client');
var fs = require('fs');
var https = require('https');
var config = require('../../config/config');
var _ = require('underscore');
/*
 * Global variable
 */
var kurentoClient = null;
var memberRegistry = new MemberRegistry();
var pipelines = {};
var candidatesQueue = {};
var idCounter = 0;


function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}

function Member(id, name, callId, ws) {
    this.id = id;
    this.callId = callId;
    this.name = name;
    this.ws = ws;
    this.peerId = null;
    this.sdpOffer = null;
}
Member.prototype.sendMessage = function(message) {
    this.ws.send(JSON.stringify(message));
}

function MemberRegistry() {
    this.memberById = {};
}
MemberRegistry.prototype.register = function(member) {
	for (var id in this.memberById) {
		var m = this.memberById[id];
		if (m.callId == member.callId && m.name == member.name)
			delete m;
	}
	console.log(this.memberById);
    this.memberById[member.id] = member;
}
MemberRegistry.prototype.unregister = function(id) {
    if (this.memberById[id]) delete this.memberById[id];
}
MemberRegistry.prototype.getById = function(id) {
    return this.memberById[id];
}
MemberRegistry.prototype.getByCallId = function(callId) {
	console.log(this.memberById);
	console.log(callId);
    return _.filter(this.memberById, function(member) {
        return member.callId == callId;
    });
}
MemberRegistry.prototype.removeById = function(id) {
    var member = this.memberById[id];
    if (!member) return;
    delete this.memberById[id];
}

function Call(id) {
    this.id = id;
    this.caller = null;
    this.called = null;
    this.pipeline = null;
    this.webRtcEndpoint = {};
}
Call.prototype.createPipeline = function(callerId, calleeId, ws, callback) {
    var self = this;
    getKurentoClient(function(error, kurentoClient) {
        if (error) {
        	console.log('Create Kurento Client error');
            return callback(error);
        }
        kurentoClient.create('MediaPipeline', function(error, pipeline) {
            if (error) {
            	console.log('Create MediaPipeline error');
                return callback(error);
            }
            pipeline.create('WebRtcEndpoint', function(error, callerWebRtcEndpoint) {
                if (error) {
                	console.log('Create WebRtcEndpoint for caller error');
                    pipeline.release();
                    return callback(error);
                }
                if (candidatesQueue[callerId]) {
                    _.each(candidatesQueue[callerId], function(candidate) {
                        callerWebRtcEndpoint.addIceCandidate(candidate);
                    });
                    delete candidatesQueue[callerId];
                }
                callerWebRtcEndpoint.on('OnIceCandidate', function(event) {
                    var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                    memberRegistry.getById(callerId).ws.send(JSON.stringify({
                        id: 'iceCandidate',
                        candidate: candidate
                    }));
                });
                pipeline.create('WebRtcEndpoint', function(error, calleeWebRtcEndpoint) {
                    if (error) {
                    	console.log('Create WebRtcEndpoint for cellee error');
                        pipeline.release();
                        return callback(error);
                    }
                    if (candidatesQueue[calleeId]) {
                        _.each(candidatesQueue[calleeId], function(candidate) {
                            calleeWebRtcEndpoint.addIceCandidate(candidate);
                        });
                        delete candidatesQueue[calleeId];
                    }
                    calleeWebRtcEndpoint.on('OnIceCandidate', function(event) {
                        var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                        memberRegistry.getById(calleeId).ws.send(JSON.stringify({
                            id: 'iceCandidate',
                            candidate: candidate
                        }));
                    });
                    callerWebRtcEndpoint.connect(calleeWebRtcEndpoint, function(error) {
                        if (error) {
                        	console.log('Error connect caller and callee');
                            pipeline.release();
                            return callback(error);
                        }
                        calleeWebRtcEndpoint.connect(callerWebRtcEndpoint, function(error) {
                            if (error) {
                            	console.log('Error connect callee and caller');
                                pipeline.release();
                                return callback(error);
                            }
                        });
                        self.pipeline = pipeline;
                        self.webRtcEndpoint[callerId] = callerWebRtcEndpoint;
                        self.webRtcEndpoint[calleeId] = calleeWebRtcEndpoint;
                        callback(null);
                    });
                });
            });
        });
    })
}
Call.prototype.generateSdpAnswer = function(id, sdpOffer, callback) {
    this.webRtcEndpoint[id].processOffer(sdpOffer, callback);
    this.webRtcEndpoint[id].gatherCandidates(function(error) {
        if (error) {
            return callback(error);
        }
    });
}
Call.prototype.release = function() {
    if (this.pipeline) this.pipeline.release();
    this.pipeline = null;
}
module.exports = {
	 interview:	function(wss) {

        wss.on('connection', function(ws) {
            var sessionId = nextUniqueId();
            console.log('Connection received with sessionId ' + sessionId);
            ws.on('error', function(error) {
                console.log('Connection ' + sessionId + ' error');
                stop(sessionId);
            });
            ws.on('close', function() {
                console.log('Connection ' + sessionId + ' closed');
                stop(sessionId);
                memberRegistry.unregister(sessionId);
            });
            ws.on('message', function(_message) {
                var message = JSON.parse(_message);
                console.log('Connection ' + sessionId + ' received message ', message.id);
                switch (message.id) {
                    case 'register':
                        register(sessionId, message.name, message.callId, ws);
                        break;
                    case 'call':
                        call(message.from, message.to, message.sdpOffer);
                        break;
                    case 'incomingCallResponse':
                        incomingCallResponse(message.from, message.to, message.callResponse, message.sdpOffer, ws);
                        break;
                    case 'stop':
                        stop(sessionId);
                        break;
                    case 'onIceCandidate':
                        onIceCandidate(sessionId, message.candidate);
                        break;
                     case 'chat':
                          chat(sessionId, message.text);
                          break;
                     case 'whiteboard':
                         whiteboard(sessionId, message.object,message.event);
                         break;
                    default:
                        ws.send(JSON.stringify({
                            id: 'error',
                            message: 'Invalid message ' + message
                        }));
                        break;
                }
            });
        });
        

    }
}
    //Recover kurentoClient for the first time.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }
    kurento(config.ws_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function stop(sessionId) {
    if (!pipelines[sessionId]) {
        return;
    }
    var pipeline = pipelines[sessionId];
    delete pipelines[sessionId];
    pipeline.release();
    var stopperUser = memberRegistry.getById(sessionId);
    var stoppedUser = memberRegistry.getById(stopperUser.peerId);
    stopperUser.peer = null;
    if (stoppedUser) {
        stoppedUser.peer = null;
        delete pipelines[stoppedUser.id];
        var message = {
            id: 'stopCommunication',
            message: 'remote user hanged out'
        }
        stoppedUser.sendMessage(message)
    }
    clearCandidatesQueue(sessionId);
}

function incomingCallResponse(calleeId, callerId, callResponse, calleeSdp, ws) {
    clearCandidatesQueue(calleeId);
    var callee = memberRegistry.getById(calleeId);

    function onError(callerReason, calleeReason) {
        if (pipeline) pipeline.release();
        if (caller) {
            var callerMessage = {
                id: 'callResponse',
                response: 'rejected'
            }
            if (callerReason) callerMessage.message = callerReason;
            caller.sendMessage(callerMessage);
        }
        var calleeMessage = {
            id: 'stopCommunication'
        };
        if (calleeReason) calleeMessage.message = calleeReason;
        callee.sendMessage(calleeMessage);
    }
    if (!callerId || !memberRegistry.getById(callerId)) {
        return onError(null, 'unknown from = ' + callerId);
    }
    var caller = memberRegistry.getById(callerId);
    if (callResponse === 'accept') {
        var pipeline = new Call();
        pipelines[caller.id] = pipeline;
        pipelines[callee.id] = pipeline;
        pipeline.createPipeline(caller.id, callee.id, ws, function(error) {
            if (error) {
                return onError(error, error);
            }
            pipeline.generateSdpAnswer(caller.id, caller.sdpOffer, function(error, callerSdpAnswer) {
            	console.log('Process answer to caller' + caller.sdpOffer);
                if (error) {
                    return onError(error, error);
                }
                pipeline.generateSdpAnswer(callee.id, calleeSdp, function(error, calleeSdpAnswer) {
                	console.log('Process answer to caller' + calleeSdp);
                    if (error) {
                        return onError(error, error);
                    }
                    var message = {
                        id: 'startCommunication',
                        sdpAnswer: calleeSdpAnswer
                    };
                    callee.sendMessage(message);
                    message = {
                        id: 'callResponse',
                        response: 'accepted',
                        sdpAnswer: callerSdpAnswer
                    };
                    caller.sendMessage(message);
                });
            });
        });
    } else {
        var decline = {
            id: 'callResponse',
            response: 'rejected',
            message: 'user declined'
        };
        caller.sendMessage(decline);
    }
}

function call(callerId, calleeId, sdpOffer) {
    clearCandidatesQueue(callerId);
    var caller = memberRegistry.getById(callerId);
    var rejectCause = 'User ' + callerId + ' is not registered';
    var callee = memberRegistry.getById(calleeId);
    caller.sdpOffer = sdpOffer
    callee.peerId = callerId;
    caller.peerId = calleeId;
    var message = {
        id: 'incomingCall',
        from: callerId,
        to:calleeId
    };
    try {
    	console.log(callee);
        return callee.sendMessage(message);
    } catch (exception) {
        rejectCause = "Error " + exception;    
	    var message = {
	        id: 'callResponse',
	        response: 'rejected: ',
	        message: rejectCause
	    };
	    caller.sendMessage(message);
    }
}

function register(id, name, callId, ws, callback) {
    function onError(error) {
        ws.send(JSON.stringify({
            id: 'registerResponse',
            response: 'rejected ',
            message: error
        }));
    }
    memberRegistry.register(new Member(id, name, callId, ws));
    try {
        ws.send(JSON.stringify({
            id: 'registerResponse',
            response: 'accepted'
        }));
    } catch (exception) {
        onError(exception);
    }
    broadcastMember(callId);
}

function broadcastMember(meetingId) {
    var memberList = memberRegistry.getByCallId(meetingId);
    var filterData = _.map(memberList, function(member) {
        return {
            memberId: member.name,
            id: member.id,
        }
    });
    _.each(memberList, function(member) {
        try {
            member.ws.send(JSON.stringify({
                id: 'memberStatus',
                memberList: filterData
            }));
        } catch (exception) {
            console.log(exception);
        }
    });
}

function clearCandidatesQueue(sessionId) {
    if (candidatesQueue[sessionId]) {
        delete candidatesQueue[sessionId];
    }
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    if (pipelines[sessionId] && pipelines[sessionId].webRtcEndpoint && pipelines[sessionId].webRtcEndpoint[sessionId]) {
        var webRtcEndpoint = pipelines[sessionId].webRtcEndpoint[sessionId];
        webRtcEndpoint.addIceCandidate(candidate);
    } else {
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

function chat(sessionId,text) {
	var member = memberRegistry.getById(sessionId);
	if (member && member.peerId) {
		var peer = memberRegistry.getById(member.peerId);
		 try {
			 peer.ws.send(JSON.stringify({
	                id: 'chatEvent',
	                text:text
	            }));
	        } catch (exception) {
	            console.log(exception);
	        }
	}
}

function whiteboard(sessionId,object,event) {
	var member = memberRegistry.getById(sessionId);
	if (member && member.peerId) {
		var peer = memberRegistry.getById(member.peerId);
		 try {
			 peer.ws.send(JSON.stringify({
	                id: 'whiteboardEvent',
	                object:object,
	                event:event
	            }));
	        } catch (exception) {
	            console.log(exception);
	        }
	}
}