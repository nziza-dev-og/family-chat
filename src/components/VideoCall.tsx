
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Video, VideoOff, Mic, MicOff, Phone, Users, Copy, UserPlus, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface Participant {
  id: string;
  // Add other participant details if needed, e.g., username
}

interface VideoCallProps {
  initialRoomId?: string | null;
}

const VideoCall: React.FC<VideoCallProps> = ({ initialRoomId }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState<string>(initialRoomId || '');
  const [inputRoomId, setInputRoomId] = useState<string>(initialRoomId || '');
  const [isInRoom, setIsInRoom] = useState<boolean>(false);
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(true);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected'); // server connection
  const [peerConnectionStatus, setPeerConnectionStatus] = useState<string>('new'); // WebRTC connection
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string>('');
  const [isInitiator, setIsInitiator] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();

  const rtcConfiguration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10
  };

  const cleanup = useCallback(() => {
    console.log('VideoCall: Cleanup called');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsCallActive(false);
    setPeerConnectionStatus('closed');
  }, []);
  
  useEffect(() => {
    const signalingServerUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER;
    if (!signalingServerUrl) {
      console.error("VideoCall: NEXT_PUBLIC_SIGNALING_SERVER is not defined.");
      setError("Signaling server URL is not configured.");
      setConnectionStatus('failed');
      return;
    }
    
    console.log('VideoCall: Attempting to connect to Signaling Server:', signalingServerUrl);

    const newSocket = io(signalingServerUrl, {
      path: '/socketserver', // Using the path for the external server
      transports: ['websocket'],
      autoConnect: true,
    });
    
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
      console.log('VideoCall: Connected to signaling server:', newSocket.id, 'at', signalingServerUrl + '/socketserver');
      setConnectionStatus('connected');
      setError('');
      if (initialRoomId) { 
        setInputRoomId(initialRoomId.toUpperCase());
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('VideoCall: Disconnected from signaling server:', reason);
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (err) => {
      console.error('VideoCall: Signaling server connection error:', err);
      setError(`Failed to connect to signaling server (${signalingServerUrl}/socketserver): ${err.message}.`);
      setConnectionStatus('failed');
    });
    
    newSocket.on('room-created', (data: { roomId: string }) => {
      console.log('VideoCall: Room created:', data.roomId);
      setRoomId(data.roomId);
      setInputRoomId(data.roomId); 
      setIsInitiator(true);
      setIsInRoom(true);
      if(newSocket.id) setParticipants([{id: newSocket.id}]);
    });

    newSocket.on('room-joined', (data: { roomId: string; participants?: Participant[] }) => {
      console.log('VideoCall: Joined room:', data.roomId, 'Existing participants:', data.participants);
      setRoomId(data.roomId);
      setIsInitiator(false);
      setIsInRoom(true);
      setParticipants(data.participants || []);
    });

    newSocket.on('user-joined', (data: Participant) => {
      console.log('VideoCall: User joined:', data.id);
      setParticipants(prev => [...prev, data]);
      toast({ title: "User Joined", description: `User ${data.id.substring(0,6)} joined the room.`});
      if (isInitiator && localStreamRef.current && !isCallActive && peerConnectionRef.current) {
        console.log('VideoCall: New user joined, initiator sending offer.');
        initiateCall();
      }
    });

    newSocket.on('user-left', (data: { id: string }) => {
      console.log('VideoCall: User left:', data.id);
      toast({ title: "User Left", description: `User ${data.id.substring(0,6)} left the room.`});
      setParticipants(prev => prev.filter(p => p.id !== data.id));
      if (participants.length <= 1) { 
        console.log('VideoCall: Other user left, ending call.');
        endCall(); 
      }
    });

    newSocket.on('offer', async (data: { offer: RTCSessionDescriptionInit, from: string }) => {
      if (data.from === newSocket.id) return; 
      console.log('VideoCall: Received offer from', data.from);
      await handleOffer(data.offer, data.from);
    });

    newSocket.on('answer', async (data: { answer: RTCSessionDescriptionInit, from: string }) => {
      if (data.from === newSocket.id) return;
      console.log('VideoCall: Received answer from', data.from);
      await handleAnswer(data.answer);
    });

    newSocket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit, from: string }) => {
      if (data.from === newSocket.id) return;
      console.log('VideoCall: Received ICE candidate from', data.from);
      await handleIceCandidate(data.candidate);
    });

    newSocket.on('room-error', (data: { message: string }) => {
      setError(data.message);
      toast({variant: "destructive", title: "Room Error", description: data.message});
    });

    return () => {
      console.log('VideoCall: Disconnecting socket on component unmount');
      newSocket.disconnect();
      cleanup();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRoomId]); // Removed cleanup from deps, keep isInitiator, isCallActive

  const initializeMedia = async () => {
    if (localStreamRef.current) {
        console.log('VideoCall: Media already initialized.');
        return localStreamRef.current;
    }
    console.log('VideoCall: Initializing media (camera/mic)');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoEnabled ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: {ideal: 24 }} : false,
        audio: isAudioEnabled ? { echoCancellation: true, noiseSuppression: true } : false,
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream); 
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      console.log('VideoCall: Media initialized successfully');
      return stream;
    } catch (err: any) {
      setError('Failed to access camera/microphone: ' + err.message);
      toast({variant: "destructive", title: "Media Error", description: 'Failed to access camera/microphone: ' + err.message});
      console.error('VideoCall: getUserMedia error:', err);
      throw err;
    }
  };

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
        console.log('VideoCall: PeerConnection already exists and not closed.');
        return peerConnectionRef.current;
    }
    console.log('VideoCall: Creating new PeerConnection');
    const pc = new RTCPeerConnection(rtcConfiguration);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        console.log('VideoCall: Sending ICE candidate');
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          roomId: roomId
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('VideoCall: Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      } else { 
        if (!remoteStream || (event.streams[0] && remoteStream.id !== event.streams[0].id)) {
            const newStream = new MediaStream();
            event.track.onunmute = () => { // Older browsers may need this
                if(event.track) newStream.addTrack(event.track);
                setRemoteStream(newStream);
                if (remoteVideoRef.current) {
                    remoteVideoRef.current.srcObject = newStream;
                }
            };
             if(event.track) newStream.addTrack(event.track); // Add track immediately for modern browsers
             setRemoteStream(newStream);
             if (remoteVideoRef.current) {
                 remoteVideoRef.current.srcObject = newStream;
             }
        }
      }
    };
    
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      const state = pc.connectionState;
      console.log('VideoCall: PeerConnection state:', state);
      setPeerConnectionStatus(state);
      
      if (state === 'connected') {
        setIsCallActive(true);
        setError('');
        toast({title: "Call Connected", description: "You are now connected."});
      } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        setError(state === 'failed' ? 'Connection failed.' : 'Connection lost.');
        if(state !== 'closed') { 
          cleanup(); 
        }
        setIsCallActive(false);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('VideoCall: Adding local track to PeerConnection:', track.kind);
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
        console.warn('VideoCall: Local stream not available when creating peer connection. Tracks will be added later if media is initialized.');
    }
    
    return pc;
  }, [roomId, rtcConfiguration, cleanup, toast, remoteStream]);


  const handleCreateRoom = async () => {
    if (!socketRef.current) {
      setError('Not connected to signaling server');
      return;
    }
    setError('');
    try {
      await initializeMedia(); 
      if (!localStreamRef.current) throw new Error("Media stream not available after initialization.");
      
      createPeerConnection(); 
      
      const newGeneratedRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      socketRef.current.emit('create-room', { roomId: newGeneratedRoomId });
    } catch (err: any) {
      setError('Failed to create room: ' + err.message);
      toast({variant: "destructive", title: "Room Creation Error", description: 'Failed to create room: ' + err.message});
    }
  };

  const handleJoinRoom = async () => {
    const roomToJoin = inputRoomId.trim().toUpperCase();
    if (!socketRef.current || !roomToJoin) {
      setError(!socketRef.current ? 'Not connected to server' : 'Please enter a room ID');
      return;
    }
    setError('');
    try {
      await initializeMedia(); 
      if (!localStreamRef.current) throw new Error("Media stream not available after initialization.");

      createPeerConnection(); 
      
      setRoomId(roomToJoin); 
      socketRef.current.emit('join-room', { roomId: roomToJoin });
    } catch (err: any) {
      setError('Failed to join room: ' + err.message);
      toast({variant: "destructive", title: "Join Room Error", description: 'Failed to join room: ' + err.message});
    }
  };

  const initiateCall = useCallback(async () => {
    if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
      console.log('VideoCall: PeerConnection not found or closed, creating one for initiating call.');
      createPeerConnection();
    }
    if (!peerConnectionRef.current) {
        setError('Peer connection could not be established.');
        return;
    }
    if (!localStreamRef.current) {
        setError('Local media not available to initiate call.');
        toast({variant: "destructive", title: "Media Error", description: "Local camera/mic not ready."});
        return;
    }
    localStreamRef.current.getTracks().forEach(track => {
        if (peerConnectionRef.current && !peerConnectionRef.current!.getSenders().find(sender => sender.track === track)) {
            console.log('VideoCall: Adding missing local track before offer:', track.kind);
            peerConnectionRef.current!.addTrack(track, localStreamRef.current!);
        }
    });

    console.log('VideoCall: Initiating call: Creating offer');
    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      
      console.log('VideoCall: Sending offer to room:', roomId);
      socketRef.current?.emit('offer', {
        offer: offer, 
        roomId: roomId
      });
    } catch (err: any) {
      setError('Failed to create offer: ' + err.message);
      console.error('VideoCall: Create offer error:', err);
    }
  }, [roomId, createPeerConnection]);

  const handleOffer = async (offerData: RTCSessionDescriptionInit, from: string) => {
    console.log('VideoCall: Handling offer from:', from);
     if (!localStreamRef.current) {
      console.log('VideoCall: Local media not ready, initializing before handling offer.');
      try {
        await initializeMedia();
      } catch (e) {
        setError('Cannot handle offer: local media failed.');
        return;
      }
    }
    if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
      console.log('VideoCall: PeerConnection not found or closed, creating one for handling offer.');
      createPeerConnection();
    }
    if (!peerConnectionRef.current) {
        setError('Peer connection could not be established to handle offer.');
        return;
    }
    localStreamRef.current!.getTracks().forEach(track => {
        if (peerConnectionRef.current && !peerConnectionRef.current!.getSenders().find(sender => sender.track === track)) {
            console.log('VideoCall: Adding missing local track before answer:', track.kind);
            peerConnectionRef.current!.addTrack(track, localStreamRef.current!);
        }
    });

    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offerData));
      console.log('VideoCall: Creating answer');
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      
      console.log('VideoCall: Sending answer to room:', roomId);
      socketRef.current?.emit('answer', {
        answer: answer, 
        roomId: roomId,
        to: from 
      });
    } catch (err: any) {
      setError('Failed to handle offer: ' + err.message);
      console.error('VideoCall: Handle offer error:', err);
    }
  };

  const handleAnswer = async (answerData: RTCSessionDescriptionInit) => {
    console.log('VideoCall: Handling answer');
    if (!peerConnectionRef.current) {
      console.error('VideoCall: PeerConnection not available to handle answer.');
      setError('Connection error: Cannot process answer.');
      return;
    }
    try {
      await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answerData));
      console.log('VideoCall: Remote description set from answer');
    } catch (err: any) {
      setError('Failed to handle answer: ' + err.message);
      console.error('VideoCall: Handle answer error:', err);
    }
  };

  const handleIceCandidate = async (candidateData: RTCIceCandidateInit) => {
    console.log('VideoCall: Handling ICE candidate');
     if (!peerConnectionRef.current) {
      console.warn('VideoCall: PeerConnection not available to handle ICE candidate. Buffering might be needed.');
      return;
    }
    try {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidateData));
      console.log('VideoCall: ICE candidate added');
    } catch (err: any) {
      if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
        console.log('VideoCall: Ignoring ICE candidate for closed peer connection.');
      } else {
        console.error('VideoCall: Failed to add ICE candidate:', err);
      }
    }
  };

  const handleEndCall = () => {
    console.log('VideoCall: User triggered end call for room:', roomId);
    cleanup();
    if (socketRef.current && roomId) {
      socketRef.current.emit('leave-room', { roomId });
    }
    setIsInRoom(false);
    setRoomId(''); 
    setInputRoomId(''); 
    setParticipants([]);
    setIsInitiator(false);
    setPeerConnectionStatus('closed');
    setError('');
  };

  const toggleVideo = async () => {
    let currentStream = localStreamRef.current;
    if (!currentStream && !isVideoEnabled) { // If trying to turn ON video and no stream
        try {
            currentStream = await initializeMedia(); 
        } catch (e) { console.error("VideoCall: Error re-initializing media for video toggle",e); return; }
    } else if (!currentStream) { return; } // No stream and trying to turn off, do nothing

    const videoTrack = currentStream?.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      toast({ title: `Video ${videoTrack.enabled ? "On" : "Off"}`});
    } else if (!isVideoEnabled) { 
        setIsVideoEnabled(true); 
        await initializeMedia(); 
    }
  };

  const toggleAudio = async () => {
     let currentStream = localStreamRef.current;
     if (!currentStream && !isAudioEnabled) { 
        try {
            currentStream = await initializeMedia();
        } catch (e) { console.error("VideoCall: Error re-initializing media for audio toggle",e); return; }
    } else if (!currentStream) { return; }

    const audioTrack = currentStream?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
      toast({ title: `Microphone ${audioTrack.enabled ? "Unmuted" : "Muted"}`});
    } else if (!isAudioEnabled) {
        setIsAudioEnabled(true);
        await initializeMedia();
    }
  };

  const copyRoomIdToClipboard = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      toast({ title: "Room ID Copied!", description: `${roomId} copied to clipboard.` });
    } catch (err) {
      setError('Failed to copy room ID');
      toast({ variant: "destructive", title: "Copy Error", description: "Failed to copy room ID." });
    }
  };

  const getConnectionStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-500';
      case 'connecting': case 'checking': return 'text-yellow-500';
      case 'failed': case 'disconnected': case 'closed': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  if (!isInRoom) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center text-gray-800">Video Call</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}
            <Button
              onClick={handleCreateRoom}
              disabled={connectionStatus !== 'connected'}
              className="w-full py-3 text-base"
              size="lg"
            >
              <Video className="mr-2 h-5 w-5" />
              Create New Room
            </Button>
            
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-card text-muted-foreground">OR</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <Input
                type="text"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                placeholder="Enter Room ID"
                className="py-3 text-base text-center"
              />
              <Button
                onClick={handleJoinRoom}
                disabled={connectionStatus !== 'connected' || !inputRoomId.trim()}
                className="w-full py-3 text-base"
                variant="secondary"
                size="lg"
              >
                <UserPlus className="mr-2 h-5 w-5" />
                Join Room
              </Button>
            </div>
            <div className={`text-center mt-6 text-xs ${getConnectionStatusColor(connectionStatus)}`}>
              Signaling Server: {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
              {connectionStatus === 'failed' && <Button variant="link" size="sm" onClick={() => socket?.connect()} className="ml-1">Retry</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col text-white">
      <header className="bg-gray-800 p-3 flex justify-between items-center shadow-md sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <h1 className="text-lg font-semibold">Room: {roomId}</h1>
          <Button
            onClick={copyRoomIdToClipboard}
            variant="ghost"
            size="sm"
            className="text-gray-300 hover:text-white hover:bg-gray-700 px-2 py-1"
          >
            <Copy className="mr-1.5 h-4 w-4" />
            Copy ID
          </Button>
        </div>
        <div className="flex items-center space-x-3">
            <span className={`text-xs px-2 py-1 rounded-full ${peerConnectionStatus === 'connected' ? 'bg-green-600' : 'bg-yellow-600 animate-pulse'}`}>
                 Call: {peerConnectionStatus.charAt(0).toUpperCase() + peerConnectionStatus.slice(1)}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${connectionStatus === 'connected' ? 'bg-green-700' : 'bg-red-700'}`}>
                Server: {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
            </span>
        </div>
      </header>

      {error && (
        <div className="bg-red-600 text-white px-4 py-2 text-center text-sm sticky top-14 z-10"> {/* Make error sticky below header */}
          {error}
        </div>
      )}

      <main className="flex-1 p-2 md:p-4 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 h-full max-h-[calc(100vh-160px)] md:max-h-[calc(100vh-140px)]"> {/* Adjusted max-h for footer */}
          <div className="bg-black rounded-md overflow-hidden relative shadow-lg border border-gray-700">
            <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded text-xs z-10">
              You {isInitiator && '(Host)'}
            </div>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover transform scale-x-[-1]" 
            />
            {(!isVideoEnabled && localStream) && ( 
              <div className="absolute inset-0 bg-gray-800/90 flex items-center justify-center">
                <VideoOff className="w-16 h-16 text-gray-400" />
              </div>
            )}
             {!localStream && ( 
              <div className="absolute inset-0 bg-gray-800/90 flex items-center justify-center">
                <Loader2 className="w-16 h-16 text-gray-400 animate-spin" />
              </div>
            )}
          </div>

          <div className="bg-black rounded-md overflow-hidden relative shadow-lg border border-gray-700">
            <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-0.5 rounded text-xs z-10">
              {participants.length > 1 ? `Remote (${participants.find(p=>p.id !== socket?.id)?.id.substring(0,6) || 'Participant'})` : 'Waiting...'}
            </div>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {(!remoteStream && isCallActive) && (
              <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center">
                 <Loader2 className="w-16 h-16 text-gray-400 animate-spin mb-3" />
                 <p className="text-gray-400 text-sm">Connecting to peer...</p>
              </div>
            )}
             {(!isCallActive && participants.length < 2 && isInRoom) && ( // Show waiting only if in room
                 <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center">
                    <Users className="w-16 h-16 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Waiting for participant to join...</p>
                    <p className="text-xs text-gray-500 mt-1">Share Room ID: {roomId}</p>
                </div>
            )}
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 p-3 border-t border-gray-700 sticky bottom-0 z-20">
        <div className="flex justify-center items-center space-x-3 md:space-x-4">
          <Button
            onClick={toggleVideo}
            variant="outline"
            size="lg"
            className={`rounded-full p-3 ${
              isVideoEnabled
                ? 'bg-gray-600 hover:bg-gray-500 border-gray-500'
                : 'bg-red-600 hover:bg-red-500 border-red-500'
            } text-white`}
            aria-label={isVideoEnabled ? "Turn video off" : "Turn video on"}
          >
            {isVideoEnabled ? <Video className="h-5 w-5 md:h-6 md:w-6" /> : <VideoOff className="h-5 w-5 md:h-6 md:w-6" />}
          </Button>
          
          <Button
            onClick={toggleAudio}
             variant="outline"
            size="lg"
            className={`rounded-full p-3 ${
              isAudioEnabled
                ? 'bg-gray-600 hover:bg-gray-500 border-gray-500'
                : 'bg-red-600 hover:bg-red-500 border-red-500'
            } text-white`}
            aria-label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {isAudioEnabled ? <Mic className="h-5 w-5 md:h-6 md:w-6" /> : <MicOff className="h-5 w-5 md:h-6 md:w-6" />}
          </Button>
          
          <Button
            onClick={handleEndCall}
            variant="destructive"
            size="lg"
            className="rounded-full p-3"
            aria-label="End call"
          >
            <Phone className="h-5 w-5 md:h-6 md:w-6" />
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default VideoCall;
