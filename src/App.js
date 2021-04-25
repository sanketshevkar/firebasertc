import './App.css';
import React, { useState, useRef } from 'react';
import firebase from './firebase/index'

const configuration = {
    iceServers: [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
        ],
      },
    ],
    iceCandidatePoolSize: 10,
  };

let peerConnection = null;

function App() {
    
  const [media, setMedia] = useState(false);
  const [createRoom, setCreateRoom] = useState(true);
  const [joinRoom, setJoinRoom] = useState(true);
  const [hangUp, setHangUp] = useState(true);
  const [roomId, setRoomId] = useState(null);

  const localStream = useRef();
  const remoteStream = useRef();

  const registerPeerConnectionListeners = () =>{
    console.log(peerConnection)
    peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
          `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    });
  
    peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
    });
  
    peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });
  
    peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
          `ICE connection state change: ${peerConnection.iceConnectionState}`);
    });
  }

  const onClickCreateRoom = async() =>{
    console.log(createRoom);
    setCreateRoom(false);
    setJoinRoom(false);
    const db = firebase.firestore();
    const roomRef = await db.collection('rooms').doc();
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration); 
    registerPeerConnectionListeners();
    localStream.current.srcObject.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream.current.srcObject);
      });
    // Code for collecting ICE candidates below
    const callerCandidatesCollection = roomRef.collection('callerCandidates');

    peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate: ', event.candidate);
        callerCandidatesCollection.add(event.candidate.toJSON());
      });
    // Code for collecting ICE candidates above

    // Code for creating a room below
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log('Created offer:', offer);

    const roomWithOffer = {
        'offer': {
        type: offer.type,
        sdp: offer.sdp,
        },
    };
    await roomRef.set(roomWithOffer);
    setRoomId(roomRef.id);
    // Code for creating a room above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.current.srcObject.addTrack(track);
      });
    });

    // Listening for remote session description below
    roomRef.onSnapshot(async snapshot => {
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data && data.answer) {
        console.log('Got remote description: ', data.answer);
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(rtcSessionDescription);
      }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listen for remote ICE candidates above

  }

  const onClickMedia = async() =>{
    const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
    localStream.current.srcObject = stream;
    remoteStream.current.srcObject = new MediaStream();
    setMedia(true);
    setJoinRoom(false);
    setCreateRoom(false);
    setHangUp(false);
  }

  return (
    <div className="App">
      <div id="buttons">
    <button className="mdc-button mdc-button--raised" id="cameraBtn" disabled={media} onClick={onClickMedia}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">perm_camera_mic</i>
        <span className="mdc-button__label">Open camera microphone</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={createRoom} id="createBtn" onClick={onClickCreateRoom}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">group_add</i>
        <span className="mdc-button__label">Create room</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={joinRoom} id="joinBtn">
        <i className="material-icons mdc-button__icon" aria-hidden="true">group</i>
        <span className="mdc-button__label">Join room</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={hangUp} id="hangupBtn">
        <i className="material-icons mdc-button__icon" aria-hidden="true">close</i>
        <span className="mdc-button__label">Hangup</span>
    </button>
</div>
<div>
    <span id="currentRoom">{roomId}</span>
</div>
<div id="videos">
    <video id="localVideo" muted autoPlay ref={localStream} playsInline ></video>
    <video id="remoteVideo" autoPlay playsInline ref={remoteStream}></video>
</div>
<div className="mdc-dialog"
     id="room-dialog"
     role="alertdialog"
     aria-modal="true"
     aria-labelledby="my-dialog-title"
     aria-describedby="my-dialog-content">
    <div className="mdc-dialog__container">
        <div className="mdc-dialog__surface">
            <h2 className="mdc-dialog__title" id="my-dialog-title">Join room</h2>
            <div className="mdc-dialog__content" id="my-dialog-content">
                Enter ID for room to join:
                <div className="mdc-text-field">
                    <input type="text" id="room-id" className="mdc-text-field__input"/>
                    <label className="mdc-floating-label" htmlFor="my-text-field">Room ID</label>
                    <div className="mdc-line-ripple"></div>
                </div>
            </div>
            <footer className="mdc-dialog__actions">
                <button type="button" className="mdc-button mdc-dialog__button" data-mdc-dialog-action="no">
                    <span className="mdc-button__label">Cancel</span>
                </button>
                <button id="confirmJoinBtn" type="button" className="mdc-button mdc-dialog__button"
                        data-mdc-dialog-action="yes">
                    <span className="mdc-button__label">Join</span>
                </button>
            </footer>
        </div>
    </div>
    <div className="mdc-dialog__scrim"></div>
</div>
    </div>
  );
}

export default App;
