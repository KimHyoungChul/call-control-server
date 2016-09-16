var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var kurento = require('kurento-client');
var fs = require('fs');
var https = require('https');
var config = require('../../config/config');
var _ = require('underscore');
var memberList = require('../demo/data');
/*
 * Global variable
 */
var kurentoClient = null;
var memberRegistry = new MemberRegistry();
var idCounter = 0;

function nextUniqueId()
{
    idCounter++;
    return idCounter.toString();
}

function Member(id, userId,profile, ws)
{
    this.id = id;
    this.ws = ws;
    this.avail = false;
    this.userId = userId;
    this.profile = profile;
    if (this.profile.role == 'presenter') this.invited = true;
    else this.invited = false;
    this.pipeline = null;
    this.pubWebRtcEndpoint = null;
    this.pubCandidateQueue = [];
    this.subCandidateQueue = {};
    this.subWebRtcEndpoint = {};
}
Member.prototype.sendMessage = function(message)
{
    this.ws.send(JSON.stringify(message));
}

function MemberRegistry()
{
    this.memberById = {};
}
MemberRegistry.prototype.register = function(member)
{
    this.memberById[member.id] = member;
}
MemberRegistry.prototype.unregister = function(id)
{
    if (this.memberById[id]) delete this.memberById[id];
}
MemberRegistry.prototype.getById = function(id)
{
    return this.memberById[id];
}
MemberRegistry.prototype.getByUserId = function(userId)
{
    for (var id in this.memberById)
    {
        if (this.memberById[id].userId == userId) return this.memberById[id]
    }
    return null;
}
MemberRegistry.prototype.removeById = function(id)
{
    var member = this.memberById[id];
    if (!member) return;
    delete this.memberById[id];
}
Member.prototype.publish = function(sdpOffer, callback)
{
    var self = this;
    getKurentoClient(function(error, kurentoClient)
    {
        if (error)
        {
            console.log('Create Kurento Client error');
            return callback(false);
        }
        kurentoClient.create('MediaPipeline', function(error, pipeline)
        {
            if (error)
            {
                console.log('Create MediaPipeline error');
                return callback(false);
            }
            pipeline.create('WebRtcEndpoint', function(error, pubWebRtcEndpoint)
            {
                if (error)
                {
                    console.log('Create WebRtcEndpoint for publisher' +self.userId+' error');
                    pipeline.release();
                    return callback(false);
                }
                _.each(self.candidatesQueue, function(candidate)
                {
                    pubWebRtcEndpoint.addIceCandidate(candidate);
                });
                self.pubCandidateQueue = [];
                console.log('Publisher ' + self.userId+': clear candidate')
                pubWebRtcEndpoint.on('OnIceCandidate', function(event)
                {
                    var candidate = kurento.getComplexType('IceCandidate')
                        (event.candidate);
                    self.ws.send(JSON.stringify(
                    {
                        id: 'onPublishIceCandidateResponse',
                        candidate: candidate
                    }));
                });
                pubWebRtcEndpoint.processOffer(sdpOffer, function(error,
                    sdpAnswer)
                {
                    if (error)
                    {
                        console.log(error)
                        return callback(false);
                    }
                    pubWebRtcEndpoint.gatherCandidates(function(error)
                    {
                        if (error)
                        {
                            console.log(error)
                            return callback(false);
                        }
                    });
                    callback(true, sdpAnswer);
                    self.pipeline = pipeline;
                    self.pubWebRtcEndpoint = pubWebRtcEndpoint;
                });
            });
        });
    })
}
Member.prototype.subscribe = function(pubId, sdpOffer, callback)
{
    var self = this;
    var publisher = memberRegistry.getByUserId(pubId);
    getKurentoClient(function(error, kurentoClient)
    {
        if (error)
        {
            console.log('Create Kurento Client error');
            return callback(false);
        }
        if (!publisher.pipeline)
        {
            console.log(publisher);
            console.log('Publisher not ready ' + publisher.id);
            return callback(false);
        }
        publisher.pipeline.create('WebRtcEndpoint', function(error, subWebRtcEndpoint)
        {
            if (error)
            {
                console.log('Create WebRtcEndpoint for subscriber '+self.userId +' publisher:' + publisher.userId +' error');
                return callback(false);
            }
            console.log('Create WebRtcEndpoint for subscriber'+self.userId +' publisher:' + publisher.userId +' successfully');
           
            subWebRtcEndpoint.on('OnIceCandidate', function(event)
            {
                var candidate = kurento.getComplexType('IceCandidate')(event.candidate);
                self.ws.send(JSON.stringify(
                {
                    id: 'onSubscribeIceCandidateResponse',
                    candidate: candidate,
                    pubId: pubId
                }));
            });
            subWebRtcEndpoint.processOffer(sdpOffer, function(error, sdpAnswer)
            {
                if (error)
                {
                    console.log(error)
                    return callback(false);
                }
                console.log('Process offer for subscriber'+self.userId +' publisher:' + publisher.userId +' successfully');
                //subWebRtcEndpoint.connect(publisher.pubWebRtcEndpoint, function(
                publisher.pubWebRtcEndpoint.connect(subWebRtcEndpoint, function(
                    error)
                {
                    if (error)
                    {
                        console.log(error)
                        return callback(false);
                    }
                    console.log(
                        'Connect WebRtcEndpoint for subscriber'+self.userId +' publisher:' + publisher.userId +' successfully'
                    );
                    callback(true, sdpAnswer);
                    
                    subWebRtcEndpoint.gatherCandidates(function(error)
                    {
                        if (error)
                        {
                            console.log(error)
                            return callback(false);
                        }
                    });
                    _.each(self.subCandidateQueue[publisher.userId], function(candidate)
                            {
                                subWebRtcEndpoint.addIceCandidate(candidate);
                            });
                        self.subCandidateQueue[publisher.userId] = [];
                        self.subWebRtcEndpoint[publisher.userId] =  subWebRtcEndpoint;
                        console.log('Subscriber  ' + self.userId+': clear candidate on publisher:'+publisher.userId )
                });
            });
        });
    })
}
module.exports = {
        conference: function(wss)
        {
            wss.on('connection', function(ws)
            {
                var sessionId = nextUniqueId();
                console.log('Connection received with sessionId ' + sessionId);
                ws.on('error', function(error)
                {
                    console.log('Connection ' + sessionId + ' error');
                    stop(sessionId);
                });
                ws.on('close', function()
                {
                    console.log('Connection ' + sessionId + ' closed');
                    stop(sessionId);
                });
                ws.on('message', function(_message)
                {
                    var message = JSON.parse(_message);
                    console.log('Connection ' + sessionId + ' received message ', message
                        .id +'  from user ' + message.userId);
                    switch (message.id)
                    {
                        case 'join':
                            join(sessionId, message.userId, ws);
                            break;
                        case 'publish':
                            publish(sessionId, message.sdpOffer);
                            break;
                        case 'subscribe':
                            subscribe(sessionId, message.pubId, message.sdpOffer);
                            break;
                        case 'avail':
                            avail(sessionId);
                            break;
                        case 'handUp':
                            handUp(sessionId);
                            break;
                        case 'handDown':
                            handDown(sessionId);
                            break;
                        case 'leave':
                            stop(sessionId);
                            break;
                        case 'end':
                            end();
                            break;
                        case 'ready':
                            ready(sessionId, message.pubId, ws);
                            break;
                        case 'invite':
                            invite(message.memberId);
                            break;
                        case 'discard':
                            discard(message.memberId);
                            break;
                        case 'stop':
                            stop(sessionId);
                            break;
                        case 'onPublishIceCandidate':
                            onPublishIceCandidate(sessionId, message.candidate);
                            break;
                        case 'onSubscribeIceCandidate':
                            onSubscribeIceCandidate(sessionId, message.pubId, message.candidate);
                            break;
                        default:
                            ws.send(JSON.stringify(
                            {
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
function getKurentoClient(callback)
{
    if (kurentoClient !== null)
    {
        return callback(null, kurentoClient);
    }
    kurento(config.ws_uri, function(error, _kurentoClient)
    {
        if (error)
        {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

function avail(sessionId)
{
    var user = memberRegistry.getById(sessionId);
    user.avail = true;
    broadcastMember();
}

function stop(sessionId)
{
    var user = memberRegistry.getById(sessionId);
    if (user)
    {
        console.log("Release resoure for user" + user.userId);
        if (user.pipeline) user.pipeline.release();
        if (user.pubWebRtcEndpoint) user.pubWebRtcEndpoint.release();
        for (var key in user.subWebRtcEndpoint) user.subWebRtcEndpoint[key].release();
        memberRegistry.unregister(sessionId);
    }
    broadcastMember();
}

function publish(sessionId, sdpOffer)
{
    var publisher = memberRegistry.getById(sessionId);
    var rejectCause = 'User ' + sessionId + ' is not registered';
    publisher.publish(sdpOffer, function(success, sdpAnswer)
    {
        if (success)
        {
            var message = {
                id: 'publishResponse',
                response: 'accepted',
                sdpAnswer: sdpAnswer
            };
            console.log('Publish response', message)
            publisher.sendMessage(message);
        }
        else
        {
            var message = {
                id: 'publishResponse',
                response: 'rejected'
            };
            publisher.sendMessage(message);
        }
    })
}

function subscribe(sessionId, pubId, sdpOffer)
{
    var subscriber = memberRegistry.getById(sessionId);
    var rejectCause = 'User ' + sessionId + ' is not registered';
    subscriber.subscribe(pubId, sdpOffer, function(success, sdpAnswer)
    {
        if (success)
        {
            var message = {
                id: 'subscribeResponse',
                response: 'accepted',
                pubId: pubId,
                sdpAnswer: sdpAnswer
            };
            subscriber.sendMessage(message);
        }
        else
        {
            var message = {
                id: 'subscribeResponse',
                response: 'rejected'
            };
            subscriber.sendMessage(message);
        }
    })
}

function join(id, userId, ws)
{
    var member = memberRegistry.getByUserId(userId);
    if (member) {
        console.log(member.id);
        console.log(member.ws.readyState);
    }
    if (member != null)
    {
        ws.send(JSON.stringify(
        {
            id: 'joinResponse',
            response: 'rejected ',
        }));
        return;
    }
   var profile =  _.find(memberList, function(member)
            {
                return member.userId == userId;
            });
   console.log(memberList);
   console.log(profile);
   console.log(userId);
   if (profile == null)
   {
       ws.send(JSON.stringify(
       {
           id: 'joinResponse',
           response: 'rejected ',
       }));
       return;
   }
    memberRegistry.register(new Member(id, userId,profile, ws));
    try
    {
        ws.send(JSON.stringify(
        {
            id: 'joinResponse',
            response: 'accepted'
        }));
        broadcastMember();
    }
    catch (exception)
    {
        ws.send(JSON.stringify(
        {
            id: 'joinResponse',
            response: 'rejected ',
            message: exception
        }));
    }
}

function getOnlineMember()
{
    var onlineList = memberRegistry.memberById;
    return _.map(onlineList, function(member)
    {
        return {
            userId: member.userId,
            avail: member.avail,
            invited: member.invited
        }
    });
}

function handUp(sessionId)
{
    var user = memberRegistry.getById(sessionId);
    if (user)
    {
        _.each(memberRegistry.memberById, function(member)
        {
            try
            {
                if (member.profile.role == 'presenter') member.ws.send(JSON.stringify(
                {
                    id: 'handUp',
                    userId: user.userId
                }));
            }
            catch (exception)
            {
                console.log(exception);
            }
        });
    }
}

function handDown(sessionId)
{
    var user = memberRegistry.getById(sessionId);
    if (user)
    {
        _.each(memberRegistry.memberById, function(member)
        {
            try
            {
                if (member.profile.role == 'presenter') member.ws.send(JSON.stringify(
                {
                    id: 'handDown',
                    userId: user.userId
                }));
            }
            catch (exception)
            {
                console.log(exception);
            }
        });
    }
}

function end()
{
    _.each(memberRegistry.memberById, function(member)
    {
        try
        {
            member.ws.send(JSON.stringify(
            {
                id: 'end',
                userId: member.userId
            }));
        }
        catch (exception)
        {
            console.log(exception);
        }
    });
}

function invite(memberId) {
    var member = _.find(memberRegistry.memberById, function(m) {
        return m.userId == memberId;
    });
    if (member) {
        member.invited = true;
    }
    broadcastMember();
}

function discard(memberId) {
    var member = _.find(memberRegistry.memberById, function(m) {
        return m.userId == memberId;
    });
    if (member) {
        member.invited = false;
    }
    broadcastMember();
}

function broadcastMember()
{
    var data = getOnlineMember();
    _.each(memberRegistry.memberById, function(member)
    {
        try
        {
            member.ws.send(JSON.stringify(
            {
                id: 'memberStatus',
                onlineList: data,
                memberList: memberList
            }));
        }
        catch (exception)
        {
            console.log(exception);
        }
    });
}

function ready(sessionId, pubId, ws)
{
    var publisher = memberRegistry.getByUserId(pubId);
    var source = publisher.pubWebRtcEndpoint;
    var subscriber = memberRegistry.getById(sessionId);
    var sink = subscriber.subWebRtcEndpoint[pubId];
    source.connect(sink, function(error)
    {
        if (error)
        {
            console.log(error)
            ws.send(JSON.stringify(
            {
                id: 'readyResponse',
                response: 'rejected ',
                message: error
            }));
        }
        else
        {
            ws.send(JSON.stringify(
            {
                id: 'readyResponse',
                response: 'accepted ',
                message: error
            }));
        }
    });
}

function onSubscribeIceCandidate(sessionId, pubId, _candidate)
{
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    var subscriber = memberRegistry.getById(sessionId);
    var publisher = memberRegistry.getByUserId(pubId);
    console.log('Save ice candidate subscriber '+subscriber.userId +' publisher:' + publisher.userId );
    console.log(publisher.pipeline==null)
    console.log( subscriber.subWebRtcEndpoint[pubId]==null);
    if (publisher.pipeline && subscriber.subWebRtcEndpoint[pubId])
    {
        subscriber.subWebRtcEndpoint[pubId].addIceCandidate(candidate);
    }
    else
    {
        if (!subscriber.subCandidateQueue[pubId]) 
            subscriber.subCandidateQueue[pubId] = [];
        subscriber.subCandidateQueue[pubId].push(candidate);
    }
    console.log(subscriber.subCandidateQueue[pubId].length);
}

function onPublishIceCandidate(sessionId, _candidate)
{
    var candidate = kurento.getComplexType('IceCandidate')(_candidate);
    var publisher = memberRegistry.getById(sessionId);
    console.log('Save ice candidate publisher:' + publisher.userId );
    console.log(publisher.pipeline==null)
    console.log( publisher.pubWebRtcEndpoint==null);
    if (publisher.pipeline && publisher.pubWebRtcEndpoint)
    {
        publisher.pubWebRtcEndpoint.addIceCandidate(candidate);
    }
    else
    {
        publisher.pubCandidateQueue.push(candidate);
    }
    console.log(publisher.pubCandidateQueue.length);
}