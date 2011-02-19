function sharkZapperMobileController() {
    // Implement only a single instance
    if (sharkZapperMobile) { return sharkZapperMobile; }
       
    // Variables    
    this.pendingMessages = [];
    this.callbackMessages = {};
    this.sequence = 1;
    this.currentSong = {};
    this.jQueryLoaded = false;
    this.socketIoLoaded = false;
    this.albumArtDefault = 'http://static.a.gs-cdn.net/webincludes/images/default/album_100.png';
    
    // Functions
    this.onDOMLoaded = function() {
        $('#sharkIdForm').submit(sharkZapperMobile.onSharkIdSubmit);
        $('#controls button').click(sharkZapperMobile.onCommandClick);
        $('#albumArt').bind('load',function() {
            $('#artLoading').hide();
        });
    };
    this.onSharkIdSubmit = function(e) {
        e.preventDefault();
        $('#sharkIdEntry .message').remove();
        var sharkId = $('#sharkIdInput').val();
        if (parseInt(sharkId)) {
            sharkZapperMobile.sharkId = parseInt(sharkId);
            sharkZapperMobile.bindToShark();
        } else {
            $('#sharkIdEntry').prepend('<p class="message">Error: This is not a valid ID number</p>');
        }
    };
    this.onjQueryLoaded = function() {
        if (sharkZapperMobile.jQueryLoaded == true) { return; }
        sharkZapperMobile.jQueryLoaded = true;
        sharkZapperMobile.sharkId = sharkZapperMobile.getSetting('sharkId');
        if (!sharkZapperMobile.sharkId || !parseInt(sharkZapperMobile.sharkId)) {
            $(document).ready(function() {
                $('#sharkIdEntry').show();
            });
        } else {
            sharkZapperMobile.bindToShark();
        }
        $(document).ready(sharkZapperMobile.onDOMLoaded);
    };
    this.onSocketIoLoaded = function() {
        if (sharkZapperMobile.socketIoLoaded == true) { return; }
        sharkZapperMobile.socketIoLoaded = true;
        var socket = sharkZapperMobile.socket = new io.Socket();
        socket.connect();
        socket.on('message',sharkZapperMobile.onRecieveMessage);
        sharkZapperMobile.sendPendingMessages();
    };
    this.onRecieveMessage = function(data) {
        try {
            var data = JSON.parse(data);
        } catch(e) {
            console.error('Could not parse JSON:',e,data);
            return;
        }
        if (data.sequence && sharkZapperMobile.callbackMessages[data.sequence]) {
            if (data.fault) {
                console.error('Service Fault:',data.fault);
            }
            sharkZapperMobile.callbackMessages[data.sequence].call(sharkZapperMobile,data);
            delete sharkZapperMobile.callbackMessages[data.sequence];
        } else if (data.event) {
            console.log(data.event,data.params);
            switch (data.event) {
                case 'statusUpdate':
                    if (data.params.currentSong) {
                        if (sharkZapperMobile.currentSong == null) { sharkZapperMobile.currentSong = {}; }
                        for (i in data.params.currentSong) {
                            sharkZapperMobile.currentSong[i] = data.params.currentSong[i];
                        }
                        var albumArtUrl = (sharkZapperMobile.currentSong.CoverArtFilename) ? sharkZapperMobile.currentSong.artPath + 'm' + sharkZapperMobile.currentSong.CoverArtFilename : sharkZapperMobile.albumArtDefault;
                        if ($('#albumArt').attr('src') != albumArtUrl) {
                            $('#artLoading').show();
                            $('#albumArt').attr('src',albumArtUrl);
                        }
                        
                       
                        
                        $('#songName').text(sharkZapperMobile.currentSong.SongName);
                        $('#albumName').text(sharkZapperMobile.currentSong.AlbumName);
                        $('#artistName').text(sharkZapperMobile.currentSong.ArtistName);
                    } else {
                        sharkZapperMobile.currentSong = null;
                        $('#songName').text('(none)');
                        $('#albumName,#artistName').text('');
                        $('#albumArt').hide();
                    }
                    //$('#playPauseBtn').toggleClass('paused',Boolean(data.params.isPaused));
                    break;
                default:
                    console.log('Unhandled event',data.event);
                    break;
            }
        } else {
            console.log('Unhandled message',data);
        }
    };
    this.getSetting = function(setting) {
        if (window.localStorage) {
            return (localStorage[setting]) ? localStorage[setting] : null;
        } else if (document.cookie) {
        	var ca = document.cookie.split(';');
        	for(var i=0;i < ca.length;i++) {
        	    var c = ca[i];
        	    while (c.charAt(0)==' ') c = c.substring(1,c.length);
        	    if (c.indexOf(setting) == 0) return c.substring(setting.length,c.length);
    	    }
    	    return null;
        } else {
            return null;
        }
    };
    this.saveSetting = function(setting,value) {
        if (localStorage) {
            localStorage[setting]=value;
            return true;
        } else if (document.cookie) {
            var date = new Date();
            date.setTime(date.getTime()+(365*24*60*60*1000));
            var expires = "; expires="+date.toGMTString();
       		document.cookie = setting+"="+value+expires+"; path=/";
       		return true;
        } 
        return false;
    };
    this.bindToShark = function() {
        this.sendMessage('bindToShark',{sharkId: sharkZapperMobile.sharkId},sharkZapperMobile.bindToSharkCallback);
    };
    this.bindToSharkCallback = function(result) {
        if (result.result && !result.fault) {
            $('#sharkIdEntry,#disclaimer').hide();
            $('#sharkStatus').show();
        } else {
            $('#sharkIdEntry').prepend('<p class="message">Error: This is not a valid ID number</p>');
        }
    };
    this.sendMessage = function(method,params,callback) {
        if (sharkZapperMobile.socket) {
            sharkZapperMobile.socket.send(JSON.stringify({method:method, params:params, sequence: sharkZapperMobile.sequence}));
            if (typeof callback == 'function') {
                sharkZapperMobile.callbackMessages[sharkZapperMobile.sequence] = callback;
            }
            sharkZapperMobile.sequence++;
        } else {
            sharkZapperMobile.pendingMessages.push([method,params,callback]);
        }
    };
    this.sendPendingMessages = function() {
        while (sharkZapperMobile.pendingMessages.length) {
            var message = sharkZapperMobile.pop();
            sharkZapperMobile.sendMessage(message[0], message[1], message[2]);
        }
    };
    
    this.onCommandClick = function() {
        switch (this.id) {
            case 'prevBtn':
            case 'nextBtn':
            case 'playPauseBtn':
                if (this.id == 'playPauseBtn') { $('#playPauseBtn').toggleClass('paused'); }
                sharkZapperMobile.sendMessage('sendCommand',{command:this.id.replace('Btn','')});
                break;
            default:
                console.warn('Unhandled button',this.id);
                break;
        }
    };
}
var sharkZapperMobile = new sharkZapperMobileController();
