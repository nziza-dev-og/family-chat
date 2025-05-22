
"use client";

import { useEffect, useRef, useState } from "react";

export default function VideoCallPage() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const room = "test-room"; // Static for demo

  useEffect(() => {
    const signalingServerUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER || "ws://localhost:8765";
    console.log("Attempting to connect to WebSocket server:", signalingServerUrl);
    const ws = new WebSocket(signalingServerUrl);

    ws.onopen = () => {
      console.log("WebSocket connected to:", signalingServerUrl);
      // Join the room immediately upon connection
      ws.send(JSON.stringify({ type: "join", room }));
    };

    ws.onmessage = async (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data as string);
        console.log("Received WebSocket message:", data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", msg.data, error);
        return;
      }

      if (!pcRef.current && (data.type === "offer" || data.type === "answer" || data.type === "candidate")) {
        console.warn("PeerConnection not ready, but received signaling message:", data.type);
        // Optionally, queue messages or handle this state appropriately
        // For this simplified version, we'll assume PC is ready or will be soon.
      }
      
      if (data.room !== room && data.type !== 'error') { // Ignore messages not for this room, unless it's a general error
        console.log("Message received for different room:", data.room, "Current room:", room);
        return;
      }


      if (data.type === "offer") {
        if (pcRef.current?.signalingState !== "stable" && pcRef.current?.signalingState !== "have-local-offer") {
            console.warn(`Received offer in unexpected state: ${pcRef.current?.signalingState}`);
            // Potentially reset or handle glare
        }
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pcRef.current?.createAnswer();
        await pcRef.current?.setLocalDescription(answer!);
        ws.send(JSON.stringify({ type: "answer", answer, room }));
      } else if (data.type === "answer") {
        await pcRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
      } else if (data.type === "candidate") {
        if (data.candidate) {
            await pcRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } else if (data.type === "error") {
        console.error("Signaling server error:", data.message);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = (event) => {
      console.log("WebSocket disconnected:", event.reason, "Code:", event.code);
    };

    setSocket(ws);

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, room }));
      }
    };

    pc.ontrack = (e) => {
      if (remoteVideo.current && e.streams && e.streams[0]) {
        remoteVideo.current.srcObject = e.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
        if(pcRef.current) {
            console.log("PeerConnection state:", pcRef.current.connectionState);
        }
    }

    pcRef.current = pc;

    const startMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo.current) {
                localVideo.current.srcObject = stream;
            }
            stream.getTracks().forEach((track) => pcRef.current?.addTrack(track, stream));
        } catch (error) {
            console.error("Error accessing media devices.", error);
        }
    };

    startMedia();

    return () => {
      console.log("Cleaning up VideoCallPage component.");
      ws.close();
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (localVideo.current && localVideo.current.srcObject) {
        (localVideo.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
       if (remoteVideo.current && remoteVideo.current.srcObject) {
        (remoteVideo.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Empty dependency array means this runs once on mount

  const startCall = async () => {
    if (!pcRef.current || !socket) {
        console.error("PeerConnection or WebSocket not initialized.");
        return;
    }
    if (pcRef.current.signalingState !== "stable") {
        console.warn("Cannot start call, signaling state is not stable:", pcRef.current.signalingState);
        return;
    }
    try {
        const offer = await pcRef.current.createOffer();
        await pcRef.current.setLocalDescription(offer!); // Note: offer can be undefined if PC is closed
        socket.send(JSON.stringify({ type: "offer", offer: pcRef.current.localDescription, room }));
    } catch (error) {
        console.error("Error creating offer:", error);
    }
  };

  return (
    <main className="p-6 bg-gray-900 text-white min-h-screen flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold mb-6 text-center">🎥 WebRTC Video Call</h1>
        <p className="text-center mb-2 text-sm text-gray-400">Room: {room}</p>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1 relative aspect-video bg-black rounded-lg shadow-md overflow-hidden border border-gray-700">
            <video ref={localVideo} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
            <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs">Local</div>
          </div>
          <div className="flex-1 relative aspect-video bg-black rounded-lg shadow-md overflow-hidden border border-gray-700">
            <video ref={remoteVideo} autoPlay playsInline className="w-full h-full object-cover" />
             <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs">Remote</div>
          </div>
        </div>
        <div className="text-center">
          <button
            onClick={startCall}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
          >
            Start Call / Send Offer
          </button>
        </div>
      </div>
    </main>
  );
}
