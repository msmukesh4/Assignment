'use strict';

const ICE = "ice_candidate";
const OFFER = "offer";
const ANSWER = "answer";
const CALL_ENDED = "call_end";
const EDITOR_TYPING = "user_typing";
const EDITOR_TEXT = "editor_text";
const EDITOR_ACTION = "editor_action";

const startCall = document.getElementById('startCall');
const endCall = document.getElementById('endCall');
const localVideo = document.getElementById('local_video');
const remoteVideo = document.getElementById('remote_video');
const myTextArea = document.getElementById('myTextArea');
const peerTypingLabel = document.getElementById('peerTyping');

// only one google stun server is used
const servers = {"iceServers" : [
        { "urls" : "stun:stun.l.google.com:19302" }
      ]};

let localStream;
let pc;
var myId, peerId;
const signaling = new SignalingChannel();

const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function gotStream(stream) {
  console.log('Received local stream');
  localVideo.srcObject = stream;
  localStream = stream;
  startCall.disabled = false;
  toggleView(startCall);
}

/*
* Connect to signal server
* and register all the events
*/
$("#config #connect").on('click', function(){
  console.log("connecting to server...");
  myId = $("#config #myId").val();
  peerId = $("#config #peerId").val();

  console.log("my id : "+myId);
  console.log("peer id : "+peerId);

  if (myId === "" && peerId === "") {
    alert("myId or peerId cannot be empty");
    return;
  }

  if (myId === peerId) {
    alert("myId should not be equal to peerId");
    return;
  }

  // Connect to signaling server
  signaling.connect({ 'host':'http://ec2-34-217-59-193.us-west-2.compute.amazonaws.com:8095', 'token': myId})
  .then(()=>{
        console.log("connected");
        $("#config #connect").hide();
        $("#config #disconnect").show();
        $("#videoView").show();
        // resolve msg
        signaling.onMessage = function(from, data){
          console.log("connect : from " + from + " data : "+data);
          registerEvents(data)
        }

        signaling.onServerDisconnected = function(){
          console.log("server disconected");
          $("#config #connect").show();
          $("#config #disconnect").hide();
          $("#videoView").hide();
        }
        initialize();
      });
});

$("#config #disconnect").on('click', function(){
  if (signaling) {
    signaling.disconnect();
  }
});

$("#editorActions #lock").on('click', function(){
  if (signaling) {
    $(".editor_container #editorLocked").show();
    $(".editor_container #editorLocked").text("you locked the editor");
    console.log("locked");
    myTextArea.disabled = true;
    $("#editorActions #lock").hide();
    $("#editorActions #unlock").show();
    signaling.send(peerId, { "event" : EDITOR_ACTION, "data" : true });
  }
});

$("#editorActions #unlock").on('click', function(){
  if (signaling) {
    console.log("unlock");
    $(".editor_container #editorLocked").text("you unlocked the editor");
    myTextArea.disabled = false;
    $("#editorActions #unlock").hide();
    $("#editorActions #lock").show();
    signaling.send(peerId, { "event" : EDITOR_ACTION, "data" : false });
  }
});

function initialize() {
  $("#callActions").show();
  myTextArea.value = "";
  $(".editor_container").show();

  navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    .then(gotStream)
    .catch(e => alert(`getUserMedia() error: ${e.name}`));
}

// decode the msg the peer/signal server is coneying
function registerEvents(data){
  switch(data.event) {
    case OFFER:
        console.log("received offer");
        onOfferReceived(data.data);
        break;
    case ANSWER:
        console.log("received answer");
        onAnswerReceived(data.data);
        break;
   case ICE:
        console.log("received ice");
        onIceCandidateReceived(data.data);
        break;
    case CALL_ENDED:
        console.log("call ended");
        toggleButton();
        break;
    case EDITOR_TYPING:
        console.log("editor typing");
        onUserTyping(data.data);
        break;
    case EDITOR_TEXT:
        console.log("editor text");
        onEditorTextChanged(data.data);
        break;
    case EDITOR_ACTION:
        console.log("editor action");
        onEditorAction(data.data);
        break;
    default:
        console.log("received : "+data.event);
  }
}

function onUserTyping(typing){
    console.log("user "+peerId+" is typing : "+typing);
    if (typing) {
      $(".editor_container #peerTyping").show();
      $(".editor_container #peerTyping").text(peerId+" is typing...");
    }else {
      $(".editor_container #peerTyping").hide();
    }
}

function onEditorAction(locked){
    console.log("user "+peerId+" locked : "+locked);
    myTextArea.disabled = locked;
    if (locked) {
      $(".editor_container #editorLocked").show();
      $(".editor_container #editorLocked").text(peerId+" locked the editor");
      $("#editorActions #lock").hide();
      $("#editorActions #unlock").show();
    } else {
      $(".editor_container #editorLocked").text(peerId+" unlocked the editor");
      $("#editorActions #unlock").hide();
      $("#editorActions #lock").show();
    }
}

function onEditorTextChanged(data){
    console.log("onEditorTextChanged : "+data);
    myTextArea.value = data;
    myTextArea.scrollTop = myTextArea.scrollHeight;
}

$("#callActions #startCall").on('click', function(){
  console.log("calling...");
  $("#callActions #startCall").hide();
  $("#callActions #endCall").show();
  pc = new RTCPeerConnection(servers);
  console.log('Created local peer connection object pc1');
  pc.onicecandidate = e => onIceCandidate(e);
  pc.ontrack = gotRemoteStream;
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  console.log('Added local stream to pc');

  console.log('creating offer');
  pc.createOffer(offerOptions).then(onCreateOfferSuccess, onCreateSessionDescriptionError);
});

// called when a peer have sent an offer
function onOfferReceived(offer){
  toggleButton();
  console.log("onOfferReceived " +pc );
  pc = new RTCPeerConnection(servers);
  console.log('Created local peer connection object pc1');
  pc.onicecandidate = e => onIceCandidate(e);
  pc.ontrack = gotRemoteStream;
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  console.log('Added local stream to pc');

  if (pc) {
    console.log('pc setRemoteDescription start');
    pc.setRemoteDescription(offer).then(() => onSetRemoteSuccess(pc), onSetSessionDescriptionError);

    console.log('pc createAnswer start');
    pc.createAnswer().then(onCreateAnswerSuccess, onCreateSessionDescriptionError);

  }
}

/**
* called when a peer have sent me an answer
* with respect to my offer
*/
function onAnswerReceived(answer){
  if (pc) {
    pc.setRemoteDescription(answer).then(() => onSetRemoteSuccess(pc), onSetSessionDescriptionError);
  }
}

/**
* called when we start getting our local ice candidates
* these ice candidates need to be sent to the peer so that
* we can estrablish a WebRTC connection
*/
function onIceCandidate(event) {
  console.log(`ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);

  // send ice candidate through signal server
  signaling.send(peerId, { "event" : ICE, "data" : event.candidate });
}


/**
* called when we receive ice cendidates from the peerId
* now we need to add these ice candidates to our pc
*/
function onIceCandidateReceived(data){
  if (pc) {
    pc.addIceCandidate(data)
      .then(() => onAddIceCandidateSuccess(pc), err => onAddIceCandidateError(pc, err));
  }
}

function onCreateSessionDescriptionError(error) {
  console.log(`Failed to create session description: ${error.toString()}`);
}

/**
* succes callback while creating an offer
* after the offer is created we need to pass this offer
* to the peer and set this offer as our local SDP
* so that we can start getting our local ICE candidates
*/
function onCreateOfferSuccess(desc) {
  console.log('setLocalDescription start');
  pc.setLocalDescription(desc).then(() => onSetLocalSuccess(pc1), onSetSessionDescriptionError);

  // send sdp to remote
  signaling.send(peerId, { "event" : OFFER, "data" : desc })
}

function onSetLocalSuccess(pc) {
  console.log(`setLocalDescription complete`);
}

function onSetRemoteSuccess(pc) {
  console.log(`setRemoteDescription complete`);
}

function onSetSessionDescriptionError(error) {
  console.log(`Failed to set session description: ${error.toString()}`);
}

/**
* this is a callback function which is called
* when the pc object is connected.
*/
function gotRemoteStream(e) {
  if (remoteVideo.srcObject !== e.streams[0]) {
    remoteVideo.srcObject = e.streams[0];
    console.log('pc received remote stream');
  }
}

/**
* succes callback after creating an answer
* after the answer is created we need to pass this answer
* to the peer and set this answer as our local SDP
* so that we can start getting our local ICE candidates
*/
function onCreateAnswerSuccess(desc) {
  // console.log(`Answer from pc2:\n${desc.sdp}`);
  console.log('pc setLocalDescription start');
  pc.setLocalDescription(desc).then(() => onSetLocalSuccess(pc), onSetSessionDescriptionError);

  // send sdp to remote
  signaling.send(peerId, { "event" : ANSWER, "data" : desc })
}


function onAddIceCandidateSuccess(pc) {
  console.log(`$addIceCandidate success`);
}

function onAddIceCandidateError(pc, error) {
  console.log(`failed to add ICE Candidate: ${error.toString()}`);
}

/**
* this function is triggered when the ice candidate state changes
* state can be checking, connecting, connected, failed, disconneced, closed
*/
function onIceStateChange(pc, event) {
  if (pc) {
    console.log(`ICE state: ${pc.iceConnectionState}`);
    console.log('ICE state change event: ', event);
  }
}


$("#callActions #endCall").on('click', function(){
  $("#callActions #endCall").hide();
  $("#callActions #startCall").show();
  console.log('Ending call');
  pc.close();
  signaling.send(peerId, { "event" : CALL_ENDED, "data" : "" });
});

function toggleView(x) {
    if (x.style.display === "none") {
        x.style.display = "block";
    } else {
        x.style.display = "none";
    }
}

function toggleButton() {
    toggleView(startCall);
    toggleView(endCall);
}

toggleButton();

$(".editor_container textarea")
  .focusin(function() {
    console.log("focus in");
    signaling.send(peerId, { "event" : EDITOR_TYPING, "data" : true });
  })
  .focusout(function() {
    console.log("focus out");
    signaling.send(peerId, { "event" : EDITOR_TYPING, "data" : false });
  });

function myTextChanged(e){
  // console.log("text changed "+myTextArea.value);
  signaling.send(peerId, { "event" : EDITOR_TEXT, "data" : myTextArea.value });
}
