import './App.css';
import React, { useState, useRef, useEffect } from 'react';
import firebase from './firebase/index'
import Modal from './components/Modal';

function App() {
    
  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [videoButton, setVideoButton] = useState('Turn off');
  const [audioButton, setAudioButton] = useState('Mute');
  const [connectionState, setConnectionState] = useState('Create / Join Room')
  const [createRoomButton, setCreateRoomButton] = useState(false);
  const [joinRoomButton, setJoinRoomButton] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [showModal, setShowModal] = useState(false);

  const localStream = useRef();
  const remoteStream = useRef();

  useEffect(()=>{
    onClickMedia();
    alert("please use mobile internet or hotspot.")
  }, [])

  const registerPeerConnectionListeners = () =>{
    console.log(peerConnection)
    peerConnection.addEventListener('icegatheringstatechange', () => {
      console.log(
          `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
    });
  
    peerConnection.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
      setConnectionState(peerConnection.connectionState);
    });
  
    peerConnection.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });
  
    peerConnection.addEventListener('iceconnectionstatechange ', () => {
      console.log(
          `ICE connection state change: ${peerConnection.iceConnectionState}`);
    });
  }

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

  const onClickCreateRoom = async() =>{
    setCreateRoomButton(false);
    setJoinRoomButton(false);
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

    setCreateRoomButton(true);
    setJoinRoomButton(true);
  }

  const joinRoom = async() =>{
    setCreateRoomButton(true);
    setJoinRoomButton(true);
    console.log('Join room: ', roomId);
    await joinRoomById(roomId);
  }

  const joinRoomById = async() =>{
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    console.log('Got room:', roomSnapshot.exists);
    if (roomSnapshot.exists) {
      console.log('Create PeerConnection with configuration: ', configuration);
      peerConnection = new RTCPeerConnection(configuration);
      registerPeerConnectionListeners();
      localStream.current.srcObject.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream.current.srcObject);
      });

      // Code for collecting ICE candidates below
      const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
      peerConnection.addEventListener('icecandidate', event => {
        if (!event.candidate) {
          console.log('Got final candidate!');
          return;
        }
        console.log('Got candidate: ', event.candidate);
        calleeCandidatesCollection.add(event.candidate.toJSON());
      });
      // Code for collecting ICE candidates above

      peerConnection.addEventListener('track', event => {
        console.log('Got remote track:', event.streams[0]);
        event.streams[0].getTracks().forEach(track => {
          console.log('Add a track to the remoteStream:', track);
          remoteStream.current.srcObject.addTrack(track);
        });
      });

      // Code for creating SDP answer below
      const offer = roomSnapshot.data().offer;
      console.log('Got offer:', offer);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      console.log('Created answer:', answer);
      await peerConnection.setLocalDescription(answer);

      const roomWithAnswer = {
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      };
      await roomRef.update(roomWithAnswer);
      // Code for creating SDP answer above

      // Listening for remote ICE candidates below
      roomRef.collection('callerCandidates').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
          if (change.type === 'added') {
            let data = change.doc.data();
            console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      // Listening for remote ICE candidates above
    }
  }

  const onClickMedia = async() =>{
    const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
    localStream.current.srcObject = stream;
    remoteStream.current.srcObject = new MediaStream();
  }

  const onClickHangUp = () =>{
    const tracks = localStream.current.srcObject.getTracks();
    tracks.forEach(track => {
      track.stop();
    });

    if (remoteStream.current.srcObject) {
      remoteStream.current.srcObject.getTracks().forEach(track => track.stop());
    }

    if (peerConnection) {
      peerConnection.close();
    }

    setRoomId("");
    window.location.reload();
  }

  const onClickVideo = () => {
    if(video){
      setVideo(false);
      localStream.current.srcObject.getVideoTracks()[0].enabled = false;
      setVideoButton('Turn on');
    }else{
      setVideo(true);
      localStream.current.srcObject.getVideoTracks()[0].enabled = true;
      setVideoButton('Turn off');
    }
  }

  const onClickAudio = () => {
    if(audio){
      setAudio(false);
      localStream.current.srcObject.getAudioTracks()[0].enabled = false;
      setAudioButton('Unmute');
    }else{
      setAudio(true);
      localStream.current.srcObject.getAudioTracks()[0].enabled = true;
      setAudioButton('Mute');
    }
  }

  const onClickCopy = () => {
    navigator.clipboard.writeText(roomId);
  }

  return (
    <div className="App">
      <div id="buttons">
    <button className="mdc-button mdc-button--raised" disabled={createRoomButton} id="createBtn" onClick={onClickCreateRoom}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">group_add</i>
        <span className="mdc-button__label">Create room</span>
    </button>
    <button className="mdc-button mdc-button--raised" disabled={joinRoomButton} id="joinBtn" onClick={()=>setShowModal(true)}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">group</i>
        <span className="mdc-button__label">Join room</span>
    </button>
</div>
<div style={{marginTop: '1rem'}}>
    <span className="roomIdSpan" id="currentRoom">
      <button className="roomIdButton" onClick={onClickCopy}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">assignment</i>
      </button>
      <b>Room ID: </b> 
      {roomId}
      </span>
</div>
<div className="localVideo">
    <video autoPlay ref={remoteStream} playsInline ></video>
    <div className="remoteVideo">
        <video className="videoTag" muted autoPlay playsInline ref={localStream}></video>
    </div>
    <span className="connectionState">{connectionState}</span>
    <button className="mdc-button mdc-button--raised hangUp" id="hangupBtn" onClick={onClickHangUp} >
        <i className="material-icons mdc-button__icon" aria-hidden="true">close</i>
        <span className="mdc-button__label">Hangup</span>
    </button>
    <button className="mdc-button mdc-button--raised camera" id="cameraBtn" onClick={onClickVideo}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">camera</i>
        <span className="mdc-button__label">{videoButton}</span>
    </button>
    <button className="mdc-button mdc-button--raised mic" id="cameraBtn" onClick={onClickAudio}>
        <i className="material-icons mdc-button__icon" aria-hidden="true">mic</i>
        <span className="mdc-button__label">{audioButton}</span>
    </button>
</div>
<Modal showModal={showModal} setShowModal={setShowModal} joinRoom={joinRoom} roomId={roomId} setRoomId={setRoomId} />
    </div>
  );
}

export default App;
