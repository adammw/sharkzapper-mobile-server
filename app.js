var config   = require('./config');

var Connect  = require('connect'),
    SocketIo = require('socket.io');

var app = Connect.createServer(
    Connect.conditionalGet(),
    Connect.logger(),
    Connect.staticProvider(__dirname + config.staticDir)
);

var server = Connect.createServer(
    Connect.vhost('sharkzapper.co.cc',app),
    Connect.vhost('www.sharkzapper.co.cc',app),
    Connect.vhost('m.sharkzapper.co.cc',app),
    // This error is shown to other vhost values (or where not specified)
    function (req,res) {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<html><head><title>This server is unavailable</title><style>body{font-family: Tahoma, Verdana, Arial, sans-serif}</style></head><body bgcolor="white" text="black"><table width="100%" height="100%"><tr><td align="center" valign="middle">The website you are looking for is unavailable.<br/>Please try again later.</td></tr></table></body></html>');
    }
).listen(8080);

var socket = SocketIo.listen(app, {log: function(msg) {
    console.log('0.0.0.0','-','-','['+ (new Date).toUTCString()+']',msg);
}});

var sharkIdMapping = {};
var sharkIdListeners = {};
socket.on('connection', function(client) {
    var sharkId = 0;
    var clientType = 0;
    var lastSequence = 0;
    client.on('message',function(data) {
        try {
            var data = JSON.parse(data);
        } catch(e) {
            client.send(JSON.stringify({'fault':{code:1,message:'Invalid JSON'}}));
            return;
        }
        switch (clientType) {
            case 1: // sharkzapper extension
                if (data.sequence && lastSequence > data.sequence) { return; } // ignore "old" non-sequential events
                lastSequence = data.sequence;
                if (sharkIdListeners[sharkId] && sharkIdListeners[sharkId].length) {
                    for (i in sharkIdListeners[sharkId]) {
                        if (socket.clients[sharkIdListeners[sharkId][i]]) {
                            socket.clients[sharkIdListeners[sharkId][i]].send(JSON.stringify(data));
                        } else {
                            console.log('ERR: ',sharkIdListeners[sharkId][i],'does not exist');
                        }
                    }
                }
                break;
            case 2: // mobile device
                switch (data.method) {
                    case 'sendCommand':
                        if (sharkIdMapping[sharkId] && socket.clients[sharkIdMapping[sharkId]]) {
                            delete data.method;
                            data.event = 'command';
                            socket.clients[sharkIdMapping[sharkId]].send(JSON.stringify(data));
                        }
                        break;
                    default:
                        client.send(JSON.stringify({'sequence':data.sequence,'fault':{code:4,message:'Invalid method'}}));
                }
            default:
               switch (data.method) {
                    case 'bindToService':
                        sharkId = getNextClientId();
                        sharkIdMapping[sharkId] = client.sessionId;
                        clientType = 1;
                        if (data.sequence) { lastSequence = data.sequence; }
                        client.send(JSON.stringify({'sequence':data.sequence, 'result':sharkId}));
                        break;
                    case 'bindToShark':
                        if (data.params.sharkId && sharkIdMapping[data.params.sharkId]) {
                            if (!sharkIdListeners[data.params.sharkId]) {
                                sharkIdListeners[data.params.sharkId] = [client.sessionId];
                            } else {
                                sharkIdListeners[data.params.sharkId].push(client.sessionId);
                            }
                            sharkId = data.params.sharkId;
                            clientType = 2;
                            client.send(JSON.stringify({'sequence':data.sequence,'result':true}));
                            if (data.sequence) { lastSequence = data.sequence; }
                            if (socket.clients[sharkIdMapping[data.params.sharkId]]) {
                                socket.clients[sharkIdMapping[data.params.sharkId]].send(JSON.stringify({'event':'clientConnected'}));
                            } else {
                                console.log('ERR: ',sharkIdMapping[data.params.sharkId],'does not exist');
                            }
                        } else {
                            client.send(JSON.stringify({'sequence':data.sequence,'fault':{code:2,message:'Invalid sharkId'}}));
                            if (data.sequence) { lastSequence = data.sequence; }
                            return;
                        }
                        break;
                } 
                break;
        }
    });
    client.on('disconnect', function() {
        if (sharkId && clientType) {
            if (sharkIdListeners[sharkId]) {
                var sharkListenIndex = sharkIdListeners[sharkId].indexOf(client.sessionId);
                if (sharkListenIndex != -1) {
                    sharkIdListeners[sharkId].splice(sharkListenIndex,1);
                }
            }
            if (clientType == 1 && sharkIdMapping[sharkId]) {
                delete sharkIdMapping[sharkId];
            }
        }
    });
});

function getNextClientId() {
    var sharkId = 1;
    for (i in sharkIdMapping) {
        if (parseInt(i) > sharkId) { sharkId = parseInt(i); }
    }
    return sharkId;
}
