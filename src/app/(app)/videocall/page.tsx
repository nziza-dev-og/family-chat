
"use client";

import { useEffect, useRef, useState } from "react";

export default function VideoCallPage() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const room = "test-room"; // Static for demo
  const [error, setError] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<string>("Idle");

  useEffect(() => {
    const signalingServerUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER || "ws://localhost:8765";
    console.log("Attempting to connect to WebSocket server:", signalingServerUrl);
    setError(null); // Clear previous errors
    setCallStatus("Connecting to server...");

    let ws: WebSocket;
    try {
      ws = new WebSocket(signalingServerUrl);
    } catch (e: any) {
      console.error("WebSocket instantiation error:", e);
      setError(`Failed to create WebSocket connection: ${e.message || 'Unknown error'}`);
      setCallStatus("Connection Failed");
      return;
    }
    
    ws.onopen = () => {
      console.log("WebSocket connected to:", signalingServerUrl);
      setError(null);
      setCallStatus("Connected to server. Ready to call.");
      ws.send(JSON.stringify({ type: "join", room })); // Attempt to join the room upon connection
    };

    ws.onmessage = async (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data as string);
        console.log("Received WebSocket message:", data);
      } catch (e) {
        console.error("Failed to parse WebSocket message:", msg.data, e);
        return;
      }

      if (data.room !== room && data.type !== 'error') { // Ignore messages not for this room
          console.log("Message received for different room:", data.room);
          return;
      }

      try {
        if (data.type === "offer") {
          if (!pcRef.current) {
            console.warn("PeerConnection not ready, but received offer. Initializing PC.");
            await initializePeerConnection(ws); // Pass ws to initializePeerConnection
          }
          if (pcRef.current?.signalingState !== "stable" && pcRef.current?.signalingState !== "have-local-offer") {
             console.warn(`Received offer in unexpected state: ${pcRef.current?.signalingState}. Resetting if necessary.`);
             // Potentially reset PC or ignore offer if already handling one.
          }
          console.log("Setting remote description from offer");
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.offer));
          console.log("Creating answer");
          const answer = await pcRef.current?.createAnswer();
          await pcRef.current?.setLocalDescription(answer!);
          console.log("Sending answer");
          ws.send(JSON.stringify({ type: "answer", answer: pcRef.current?.localDescription, room }));
          setCallStatus("Call in progress");
        } else if (data.type === "answer") {
          console.log("Setting remote description from answer");
          await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
          setCallStatus("Call in progress");
        } else if (data.type === "candidate") {
          if (data.candidate) {
            console.log("Adding ICE candidate");
            await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
          }
        } else if (data.type === "error") {
            console.error("Signaling server error:", data.message);
            setError(`Signaling error: ${data.message}`);
        }
      } catch (e: any) {
        console.error("Error processing signaling message:", e);
        setError(`Error processing message: ${e.message}`);
      }
    };

    ws.onerror = (event) => {
      // The 'event' object for onerror is often a generic Event, not providing detailed error codes.
      console.error("WebSocket error occurred. Connection to server failed.", event);
      setError("WebSocket connection error. Ensure the signaling server is running and accessible at " + signalingServerUrl);
      setCallStatus("Connection Failed");
    };

    ws.onclose = (event) => {
      console.log("WebSocket connection closed. Code:", event.code, "Reason:", event.reason);
      if (!event.wasClean) {
        setError(`WebSocket connection closed unexpectedly (Code: ${event.code}). Server might be down or unreachable.`);
      }
      setCallStatus("Disconnected from server");
      // Basic auto-reconnect could be added here if desired, but it's complex to get right.
    };

    setSocket(ws);

    // Initialize PeerConnection
    const initializePeerConnection = async (currentWs: WebSocket) => {
      if (pcRef.current && pcRef.current.signalingState !== 'closed') {
        console.log("PeerConnection already initialized and not closed.");
        return;
      }
      console.log("Initializing PeerConnection...");
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log("Sending ICE candidate");
          currentWs.send(JSON.stringify({ type: "candidate", candidate: e.candidate, room }));
        }
      };

      pc.ontrack = (e) => {
        console.log("Remote track received");
        if (remoteVideoRef.current && e.streams && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
        } else {
            // Fallback for older browsers or if streams[0] is not immediately available
            const newStream = new MediaStream();
            e.track.onunmute = () => { // Safari might need this
                if(e.track) newStream.addTrack(e.track);
                if(remoteVideoRef.current) remoteVideoRef.current.srcObject = newStream;
            };
            if(e.track) newStream.addTrack(e.track);
            if(remoteVideoRef.current) remoteVideoRef.current.srcObject = newStream;
        }
        setCallStatus("Call in progress");
      };

      pc.onconnectionstatechange = () => {
        if(pcRef.current) {
            console.log("PeerConnection state:", pcRef.current.connectionState);
            setCallStatus(`Call: ${pcRef.current.connectionState}`);
            if (pcRef.current.connectionState === 'failed' || pcRef.current.connectionState === 'disconnected' || pcRef.current.connectionState === 'closed') {
                // Consider cleanup or reconnection attempt
                if (pcRef.current.connectionState === 'failed') setError("WebRTC connection failed.");
            }
        }
      }
      pcRef.current = pc;

      try {
        console.log("Requesting user media...");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        console.log("User media acquired and tracks added.");
      } catch (mediaError: any) {
        console.error("Error accessing media devices:", mediaError);
        setError(`Error accessing media devices: ${mediaError.message}`);
        setCallStatus("Media Error");
      }
    };
    
    // Call initializePeerConnection, passing the current WebSocket instance
    initializePeerConnection(ws).catch(e => console.error("Failed to initialize peer connection:", e));


    return () => {
      console.log("Cleaning up WebSocket and PeerConnection.");
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
      }
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        (remoteVideoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        remoteVideoRef.current.srcObject = null;
      }
      setSocket(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array to run once on mount

  const startCall = async () => {
    if (!pcRef.current || pcRef.current.signalingState === 'closed') {
      setError("PeerConnection not initialized or closed. Please refresh.");
      console.error("Attempted to start call but PeerConnection is not ready.");
      return;
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        setError("Not connected to signaling server.");
        return;
    }
    
    console.log("Starting call: creating offer...");
    setCallStatus("Creating offer...");
    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      console.log("Sending offer");
      socket.send(JSON.stringify({ type: "offer", offer: pcRef.current.localDescription, room }));
      setCallStatus("Offer sent. Waiting for answer...");
    } catch (e: any) {
      console.error("Error creating offer:", e);
      setError(`Error creating offer: ${e.message}`);
      setCallStatus("Offer Failed");
    }
  };

  return (
    <main className="p-6 bg-gray-900 text-white min-h-screen flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-2 text-center">WebRTC Video Call</h1>
        <p className="text-center text-sm text-gray-400 mb-1">Room: {room}</p>
        <p className="text-center text-sm text-yellow-300 mb-4 h-5">{callStatus}</p>
        
        {error && (
          <div className="bg-red-500 text-white p-3 rounded-md mb-4 text-sm text-center">
            Error: {error}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative aspect-video bg-black rounded-lg shadow-md overflow-hidden border border-gray-700">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs">Local</div>
          </div>
          <div className="flex-1 relative aspect-video bg-black rounded-lg shadow-md overflow-hidden border border-gray-700">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs">Remote</div>
          </div>
        </div>
        <div className="text-center">
          <button
            onClick={startCall}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:bg-gray-500"
            disabled={!socket || socket.readyState !== WebSocket.OPEN || callStatus.startsWith("Call in progress") || callStatus.startsWith("Offer sent")}
          >
            Start Call / Send Offer
          </button>
        </div>
      </div>
    </main>
  );
}

    