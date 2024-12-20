/*
Copyright 2017 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

var config = [{
  initDataTypes: ['cenc'],
  videoCapabilities: [{
    contentType: 'video/mp4; codecs="avc1.64001F"'
    //contentType: 'application/dash+xml; codecs="avc1.64001F"'
    //contentType: 'video/mp4; codecs="avc1"'
  }]
}];

var video = document.querySelector('video');
video.addEventListener('encrypted', handleEncrypted, false);

// Temporarily set hybridTV for using dashplayer instead of dashplayer2.
var options = {};
options.option = {};
options.option.hybridTV = true;

var source = document.createElement("source");
source.setAttribute('src', '../video/EME/video_dash.mpd');
source.setAttribute('type','application/dash+xml;mediaOption=' + escape(JSON.stringify(options)));
video.appendChild(source);
video.load();

/*
navigator.requestMediaKeySystemAccess('org.w3.clearkey', config).then(
  function(keySystemAccess) {
    return keySystemAccess.createMediaKeys();
  }
).then(
  function(createdMediaKeys) {
    return video.setMediaKeys(createdMediaKeys).then(
      function() {
        var session = video.mediaKeys.createSession();
        session.addEventListener('message', handleMessage, false);

        var keyId = "279926496a7f5d25da69f2b3b2799a7f";
        var te = new TextEncoder();
        var initData = te.encode('{"kids":["' + keyId + '"]}');

        session.generateRequest('keyids', initData).catch(
          function(error) {
            console.error('Failed to generate a license request', error);
          }
        );
      },
      function(reason) {
        console.error('setMediaKeys promise is rejected : ' + reason);
      }
    ).catch(
      function() {
        console.error('setMediaKeys promise encountered an error');
      }
    );
  }
).catch(
  function(error) {
    console.error('Failed to set up MediaKeys', error);
  }
);
*/

navigator.requestMediaKeySystemAccess('org.w3.clearkey', config).then(
  function(keySystemAccess) {
    return keySystemAccess.createMediaKeys();
  }
).then(
  function(createdMediaKeys) {
    return video.setMediaKeys(createdMediaKeys);
  }
).catch(
  function(error) {
    console.error('Failed to set up MediaKeys', error);
  }
);

function handleEncrypted(event) {
  console.log('encrypted event:', event);
  var session = video.mediaKeys.createSession();
  session.addEventListener('message', handleMessage, false);
/*
  var keyId = "279926496a7f5d25da69f2b3b2799a7f";
  var te = new TextEncoder();
  var initData = te.encode('{"kids":["' + keyId + '"]}');
  var initDataType = 'keyids';
*/
  session.generateRequest(event.initDataType, event.initData).catch(
    function(error) {
      console.error('Failed to generate a license request', error);
    }   
  );  
}

function handleMessage(event) {
  console.log('message event: ', event);
  //var license = generateLicense();
  var te = new TextEncoder();
  var license = te.encode('{"keys":[{"kty":"oct","k":"zMDys7J5kmSWp_XSXaaS9g","kid":"J5kmSWp_XSXaafKzsnmafw"}],"type":"temporary"}');
  console.log('license: ', license);

  var session = event.target;
  session.update(license).catch(
    function(error) {
      console.error('Failed to update the session', error);
    }
  );
}

// cc c0 f2 b3 b2 79 92 64 
// 96 a7 f5 d2 5d a6 92 f6
var KEY = new Uint8Array([
  0xcc, 0xc0, 0xf2, 0xb3, 0xb2, 0x79, 0x92, 0x64,
  0x96, 0xa7, 0xf5, 0xd2, 0x5d, 0xa6, 0x92, 0xf6
]);

// Convert Uint8Array into base64 using base64url alphabet, without padding.
function toBase64(u8arr) {
  return btoa(String.fromCharCode.apply(null, u8arr)).
      replace(/\+/g, '-').replace(/\//g, '_').replace(/=*$/, '');
}

// This takes the place of a license server.
// kids is an array of base64-encoded key IDs
// keys is an array of base64-encoded keys
function generateLicense() {
 var keyObj = {
    kty: 'oct',
    //alg: 'A128KW',
    kid: '279926496a7f5d25da69f2b3b2799a7f',
    k: toBase64(KEY),
    type: 'temporary',
  };
  return new TextEncoder().encode(JSON.stringify({
    keys: [keyObj]
  }));
}
