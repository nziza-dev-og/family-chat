
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import Head from 'next/head';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Users, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { addMissedCallMessage } from '@/lib/chatActions';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

function VideoSDKCallPageContent() {
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [meetingId, setMeetingId] = useState('');
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<any[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [authToken, setAuthToken] = useState('');
  const [callStatus, setCallStatus] = useState('Initializing...'); // Added callStatus

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const meetingRef = useRef<any>(null);

  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const calleeIdParam = searchParams.get('calleeId');
  const chatIdParam = searchParams.get('chatId');
  const meetingIdToJoinParam = searchParams.get('meetingIdToJoin');
  const callerNameParam = searchParams.get('callerName');

  const [inviteSent, setInviteSent] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  
  const API_KEY_FROM_ENV = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;

  // Effect for generating auth token once API_KEY_FROM_ENV is available
  useEffect(() => {
    if (!API_KEY_FROM_ENV) {
        setError("Video SDK API Key is not configured in environment variables. Video calls are disabled.");
        setSdkLoaded(false);
        setCallStatus("Configuration Error");
        return;
    }
    setCallStatus("Generating token...");
    generateAuthToken();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_KEY_FROM_ENV]); 

  useEffect(() => {
    if (user && !authLoading) {
      setUserName(user.displayName || "Chat User");
    }
    if (meetingIdToJoinParam) {
      setMeetingId(meetingIdToJoinParam);
      if(!isConnected) initializeLocalMedia();
    }
    if (calleeIdParam) {
      setIsCaller(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, meetingIdToJoinParam, calleeIdParam]);

  // Effect for loading VideoSDK script
  useEffect(() => {
    const scriptId = 'videosdk-script';
    if (document.getElementById(scriptId)) {
      if (window.VideoSDK) {
        console.log('Video SDK script already loaded and available.');
        setSdkLoaded(true);
        setCallStatus(prev => prev === "Initializing..." || prev === "SDK Loading..." ? "SDK Loaded" : prev);
      } else {
        console.warn('Video SDK script tag found, but window.VideoSDK not ready. Waiting for onload.');
      }
      return; // Don't append script again if tag exists
    }
    
    setCallStatus("SDK Loading...");
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    const handleScriptLoad = () => {
      console.log('Video SDK script loaded event fired.');
      if (window.VideoSDK) {
        console.log('window.VideoSDK is available.');
        setSdkLoaded(true);
        setCallStatus(prev => prev === "SDK Loading..." ? "SDK Loaded" : prev);
      } else {
        console.warn('window.VideoSDK not available immediately after onload. Retrying check...');
        setTimeout(() => {
          if (window.VideoSDK) {
            console.log('window.VideoSDK available after delay.');
            setSdkLoaded(true);
            setCallStatus(prev => prev === "SDK Loading..." ? "SDK Loaded" : prev);
          } else {
            console.error('window.VideoSDK still not available after delay. SDK loading failed or is very slow.');
            setError('Video SDK failed to initialize properly. Please try refreshing the page.');
            setCallStatus("SDK Error");
            setSdkLoaded(false);
          }
        }, 2000); 
      }
    };

    const handleScriptError = (event: Event | string) => {
        console.error('Failed to load Video SDK script:', event);
        setError('Failed to load Video SDK. Check network or ad-blocker, then refresh.');
        setCallStatus("SDK Error");
        setSdkLoaded(false);
    };

    script.onload = handleScriptLoad;
    script.onerror = handleScriptError;
    
    document.head.appendChild(script);

    return () => {
      const existingScript = document.getElementById(scriptId);
      if (existingScript && document.head.contains(existingScript)) {
        // Document.head.removeChild(existingScript); // VideoSDK docs suggest not removing it
        console.log('Video SDK script cleanup skipped based on SDK guidance.');
      }
      if (meetingRef.current && isConnected) {
        meetingRef.current.leave();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const generateAuthToken = async () => {
    if (!API_KEY_FROM_ENV) {
        setError("Video SDK API Key is not configured in environment. Cannot generate token.");
        setCallStatus("Configuration Error");
        setAuthToken('');
        return;
    }
    try {
      setCallStatus("Fetching token from API...");
      const response = await fetch('/api/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: API_KEY_FROM_ENV, // Client sends its public API key
          permissions: ['allow_join', 'allow_mod'],
          meetingId: meetingId || undefined // Send meetingId if available
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthToken(data.token);
        setError(''); 
        setCallStatus(prev => prev.includes("Token") ? "Token Ready" : prev);
        return;
      }
      
      let detailedErrorMessage = `API route token generation failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          detailedErrorMessage += `. Server: "${errorData.message}"`;
        }
      } catch (parseError) {
        detailedErrorMessage += `. ${response.statusText || 'Could not retrieve error details from server.'}`;
      }
      console.error(detailedErrorMessage);
      throw new Error(detailedErrorMessage);

    } catch (error: any) {
      console.error('Token generation via API route failed:', error);
      // Fallback only if API route fails AND it's not a config error
      if (error.message && !error.message.includes("Server configuration error")) {
        console.log('Falling back to client-side token generation (INSECURE, FOR DEMO ONLY)');
        try {
          const token = createClientSideToken();
          setAuthToken(token);
          toast({
              title: "Using Fallback Token",
              description: "Could not reach token server. Using a temporary client-side token (not for production).",
              variant: "destructive"
          });
          setError(''); // Clear previous errors if fallback succeeds
          setCallStatus("Token Ready (Fallback)");
        } catch (clientTokenError: any) {
            setError(`Failed to generate any token: ${clientTokenError.message}`);
            setCallStatus("Token Error");
            setAuthToken('');
        }
      } else {
        // If it was a server config error, propagate that error
        setError(error.message || "Failed to generate token from API.");
        setCallStatus("Token Error");
        setAuthToken('');
      }
    }
  };
  
  const createClientSideToken = () => {
    if (!API_KEY_FROM_ENV) throw new Error("API Key missing for client-side token.");
    const payload = {
      apikey: API_KEY_FROM_ENV,
      permissions: ['allow_join', 'allow_mod'],
      version: 2,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
     // This is a placeholder and NOT a secure JWT. For demo only.
    const encodedHeader = btoa(JSON.stringify({alg: "HS256", typ: "JWT"}));
    const encodedPayload = btoa(JSON.stringify(payload));
    return `${encodedHeader}.${encodedPayload}.insecure_demo_signature_please_replace`;
  };

  const createMeetingViaApi = async () => {
    if (!authToken) {
        setError("Auth token not available for creating meeting.");
        setCallStatus("Token Error");
        return null;
    }
    setCallStatus("Creating meeting room...");
    try {
      const response = await fetch('https://api.videosdk.live/v2/rooms', {
        method: 'POST',
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP error ${response.status}: ${errorData.message || 'Failed to create room via API'}`);
      }

      const data = await response.json();
      setCallStatus("Meeting room created");
      return data.roomId;
    } catch (error: any) {
      console.error('Error creating meeting via API:', error);
      setError(`Error creating meeting: ${error.message}`);
      setCallStatus("Meeting Creation Error");
      return generateRandomMeetingId(); // Fallback to random ID if API fails
    }
  };

  const generateRandomMeetingId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const initializeLocalMedia = async () => {
    if (localStream && localStream.active) {
      // If camera/mic state has changed, re-get with new constraints
      if (localStream.getVideoTracks().length > 0 !== isCameraOn || localStream.getAudioTracks().length > 0 !== isMicOn) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null); // Force re-acquisition
      } else {
        console.log('Local media already initialized and active with consistent constraints.');
        return localStream;
      }
    }
    
    setCallStatus("Accessing media...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24 } 
        } : false,
        audio: isMicOn ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false 
      });
      
      setLocalStream(stream);
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
      }
      setCallStatus("Media ready");
      return stream;
    } catch (error: any) {
      console.error('Error accessing media devices for preview:', error);
      setError(`Camera/microphone access failed: ${error.message}. Please check browser permissions.`);
      setCallStatus("Media Error");
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
      throw error; 
    }
  };

  useEffect(() => {
    if (!isConnected && sdkLoaded && API_KEY_FROM_ENV && !authLoading) { // ensure user is also loaded if name is prefilled
        initializeLocalMedia().catch(e => console.warn("Initial media preview failed, user might need to grant permissions."));
    }
    // Only run when these specific conditions change for preview setup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected, API_KEY_FROM_ENV, authLoading]); 

  const actualJoinMeeting = async (currentMeetingId: string) => {
    if (!sdkLoaded || !window.VideoSDK) {
      setError('Video SDK is not loaded yet. Please wait or check your connection.');
      setIsJoining(false);
      setCallStatus("SDK Error");
      return;
    }
    if (!API_KEY_FROM_ENV) {
      setError("Video SDK API Key is not configured. Cannot join meeting.");
      setIsJoining(false);
      setCallStatus("Configuration Error");
      return;
    }
     if (!authToken) {
      setError("Authentication token not available. Cannot join meeting.");
      setIsJoining(false);
      setCallStatus("Token Error");
      return;
    }

    // Stop local preview stream before SDK takes over, if it exists
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null); 
        if(localVideoRef.current) localVideoRef.current.srcObject = null;
    }
    setCallStatus("Joining meeting...");

    const config = {
      name: userName,
      meetingId: currentMeetingId,
      apiKey: API_KEY_FROM_ENV, 
      token: authToken, 
      
      containerId: 'video-sdk-container', 
      redirectOnLeave: false, 
      
      micEnabled: isMicOn,
      webcamEnabled: isCameraOn,
      
      participantCanToggleSelfWebcam: true,
      participantCanToggleSelfMic: true,
      
      chatEnabled: true,
      screenShareEnabled: true,
      pollEnabled: false, 
      whiteboardEnabled: false, 
      raiseHandEnabled: true,
      
      recordingEnabled: false, 
      participantCanToggleRecording: false,
      
      brandingEnabled: false,
      poweredBy: false, 
      
      participantCanLeave: true, 
      
      maxResolution: 'hd', 
      
      debug: process.env.NODE_ENV === 'development', 
      
      theme: 'DARK', 
      mode: 'CONFERENCE', 
      multiStream: true, 
      
      layout: { type: 'SPOTLIGHT', priority: 'SPEAKER', gridSize: 4, },
      
      joinScreen: { visible: true, title: 'Video Call', meetingUrl: typeof window !== "undefined" ? window.location.href : "", },
      
      permissions: {
        askToJoin: false, toggleParticipantMic: true, toggleParticipantWebcam: true, 
        removeParticipant: true, endMeeting: true, drawOnWhiteboard: false,
        toggleWhiteboard: false, toggleRecording: false
      },
      callbacks: {
          'meeting-joined': async () => {
              console.log('[VideoSDK] Meeting joined successfully');
              setIsConnected(true);
              setIsJoining(false);
              setError('');
              setCallStatus("Connected");
              if (!isCaller && user && meetingIdToJoinParam && chatIdParam) { // Added chatIdParam check
                  try {
                      const inviteDocRef = doc(db, "videoCallInvites", user.uid);
                      const inviteSnap = await getDoc(inviteDocRef);
                      if(inviteSnap.exists() && inviteSnap.data()?.meetingId === currentMeetingId) {
                         await updateDoc(inviteDocRef, { status: 'answered', updatedAt: serverTimestamp() });
                      }
                  } catch (e) {
                      console.error("[VideoSDK] Error updating invite to answered:", e);
                  }
              }
          },
          'meeting-left': () => {
              console.log('[VideoSDK] Meeting left callback triggered');
              handleLeaveMeeting(true); 
          },
           'error': (err: any) => {
              console.error('[VideoSDK] Meeting error:', err);
              setError(`Meeting error: ${err.name || 'Unknown'} - ${err.message || 'An error occurred'}`);
              setCallStatus("Meeting Error");
              setIsJoining(false);
              setIsConnected(false); 
          },
          'participant-joined': (participant: any) => {
            console.log('[VideoSDK] Participant joined:', participant);
            setParticipants(prev => [...prev, participant]);
          },
          'participant-left': (participant: any) => {
            console.log('[VideoSDK] Participant left:', participant);
            setParticipants(prev => prev.filter(p => p.id !== participant.id));
          },
      }
    };

    try {
      // Ensure container exists
      if (!document.getElementById(config.containerId) && videoContainerRef.current) {
        const container = document.createElement('div');
        container.id = config.containerId;
        container.className = "w-full h-full"; // Ensure it takes space
        videoContainerRef.current.innerHTML = ''; // Clear previous if any
        videoContainerRef.current.appendChild(container);
      } else if (!document.getElementById(config.containerId)) {
        console.error(`[VideoSDK] Container with id '${config.containerId}' not found in DOM.`);
        setError(`Video container not found. Please ensure an element with id '${config.containerId}' exists.`);
        setCallStatus("UI Error");
        setIsJoining(false);
        return;
      }


      const meeting = window.VideoSDK.initMeeting(config);
      meetingRef.current = meeting;
      // meeting.join(); // SDK joinScreen visible: true will handle the join
    } catch (initError: any) {
      console.error('[VideoSDK] Error initializing meeting with window.VideoSDK.initMeeting:', initError);
      setError(`Meeting initialization failed: ${initError.message}`);
      setCallStatus("Initialization Error");
      setIsJoining(false);
    }
  };

  const handleJoinMeeting = async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!API_KEY_FROM_ENV) {
        setError("Video SDK API Key is not configured. Cannot proceed.");
        setCallStatus("Configuration Error");
        return;
    }
    if (!authToken) {
      setError('Authentication token not ready. Please wait and try again.');
      setCallStatus("Token Error");
      if (!API_KEY_FROM_ENV) { 
        setError("Video SDK API Key is not configured. Cannot generate token.");
      } else {
        await generateAuthToken(); 
      }
      return;
    }

    setIsJoining(true);
    setError('');
    setCallStatus("Preparing to join...");

    try {
      let finalMeetingId = meetingId.trim();
      
      if (isCaller && calleeIdParam && chatIdParam && user) {
        if (!finalMeetingId) { 
            finalMeetingId = await createMeetingViaApi();
            if (!finalMeetingId) throw new Error("Failed to obtain a meeting ID for inviting.");
            setMeetingId(finalMeetingId); 
        }
        setCallStatus("Sending invite...");
        console.log(`[VideoSDK] Caller flow: Inviting ${calleeIdParam} to meeting ${finalMeetingId} for chat ${chatIdParam}`);
        const inviteRef = doc(db, "videoCallInvites", calleeIdParam);
        
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists() && inviteSnap.data()?.status === 'ringing') {
            console.warn(`[VideoSDK] An existing ringing invite found for ${calleeIdParam}. Overwriting.`);
        }
        
        await setDoc(inviteRef, {
            callerId: user.uid,
            callerName: user.displayName || "A user",
            callerAvatar: user.photoURL || "",
            meetingId: finalMeetingId,
            status: 'ringing',
            createdAt: serverTimestamp(),
            chatId: chatIdParam,
            callType: 'videosdk' 
        });
        setInviteSent(true);
        toast({ title: "Calling...", description: `Inviting user to join meeting: ${finalMeetingId}`});
      } else if (!finalMeetingId && !meetingIdToJoinParam) { 
        finalMeetingId = await createMeetingViaApi();
        if (!finalMeetingId) {
            throw new Error("Failed to obtain a meeting ID.");
        }
        setMeetingId(finalMeetingId); 
      } else if (meetingIdToJoinParam) { 
        finalMeetingId = meetingIdToJoinParam;
      }
      
      if (!finalMeetingId) {
          throw new Error("Meeting ID is required to join.");
      }
      
      await actualJoinMeeting(finalMeetingId); 

    } catch (error: any) {
      console.error('Failed to join meeting (handleJoinMeeting):', error);
      setError(`Failed to join meeting: ${error.message}`);
      setCallStatus("Join Error");
      setIsJoining(false);
    }
  };

  const handleLeaveMeeting = (sdkInitiatedLeave = false) => {
    console.log(`[VideoSDK] handleLeaveMeeting called. SDK initiated: ${sdkInitiatedLeave}, IsConnected: ${isConnected}`);
    if (meetingRef.current && !sdkInitiatedLeave && isConnected) { // Only call leave if SDK initiated it or if we are connected
      try {
        meetingRef.current.leave();
      } catch (e) {
        console.warn("[VideoSDK] Error during meetingRef.current.leave():", e);
      }
    }
    meetingRef.current = null; 

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = ''; 
    }
    
    const wasConnected = isConnected;
    setIsConnected(false);
    setParticipants([]);
    setCallStatus("Disconnected");
    
    const currentChatId = chatIdParam || (isCaller ? chatIdParam : null); 

    if (isCaller && calleeIdParam && inviteSent && user && currentChatId) {
      console.log(`[VideoSDK] Caller leaving/cancelling. Invite to: ${calleeIdParam}`);
      deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
        .then(() => console.log(`[VideoSDK] Invite doc for ${calleeIdParam} deleted.`))
        .catch(e => console.warn("[VideoSDK] Error deleting invite on leave:", e));
      
      if (!wasConnected && !isJoining) { // If invite was sent but never connected by callee
          addMissedCallMessage(currentChatId, 'videosdk', user.uid, calleeIdParam);
      }
    }
    
    // Don't auto-navigate if SDK initiated the leave (e.g. meeting ended by host)
    // Or if it was just a cleanup from unmount.
    // Only navigate if user explicitly clicked leave or a critical error forced it.
    if (!sdkInitiatedLeave) { 
        // Check if component is still mounted before routing
        // This check is tricky in React 18 strict mode due to double-invocation of cleanup
        // Consider routing based on a specific user action rather than just here.
        // For simplicity, if not SDK initiated, we assume user wants to go back or error occurred.
        setTimeout(() => {
          if (document.visibilityState === 'visible') { // Simple check if page is still active
            router.replace(currentChatId ? `/chats/${currentChatId}` : '/chats');
          }
        }, 300);
    } else {
        // SDK initiated leave, just reset state for potential new join
        setMeetingId('');
        setIsJoining(false);
        // setError(''); // Keep error if SDK reported one
        setInviteSent(false);
    }
  };

  useEffect(() => {
    // This is the main cleanup effect for component unmount
    return () => {
        console.log("[VideoSDK] Component unmounting. Current state: isConnected:", isConnected, "isJoining:", isJoining, "inviteSent:", inviteSent);
        if (meetingRef.current && isConnected) { 
            console.log("[VideoSDK] Leaving meeting due to component unmount.");
            meetingRef.current.leave();
            meetingRef.current = null;
        }
        if (localStream) { 
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        if (videoContainerRef.current) {
            videoContainerRef.current.innerHTML = '';
        }

        // Handle invite cleanup if caller unmounts before callee answers
        if (isCaller && calleeIdParam && inviteSent && user && chatIdParam && !isConnected && !isJoining) {
            console.log(`[VideoSDK] Caller unmounting, invite was sent to ${calleeIdParam} for chat ${chatIdParam}, but not connected/joining. Cleaning up invite.`);
            deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
                .then(() => console.log(`[VideoSDK] Invite doc for ${calleeIdParam} deleted due to unmount.`))
                .catch(e => console.warn("Error deleting invite on unmount:", e));
            addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaller, calleeIdParam, chatIdParam, inviteSent, user]); // Removed localStream, isConnected, isJoining to avoid premature cleanup cycles


  const toggleCamera = async () => {
    const newCameraState = !isCameraOn;
    if (meetingRef.current && isConnected) { 
      if (newCameraState) meetingRef.current.unmuteWebcam();
      else meetingRef.current.disableWebcam();
    }
    setIsCameraOn(newCameraState); 
    if (!isConnected) { // Update preview if not in meeting
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = newCameraState);
        if (!newCameraState && localVideoRef.current) localVideoRef.current.srcObject = null; // Clear preview if turning off
        else if (newCameraState) await initializeLocalMedia(); // Re-init to get video track if it was off
      } else if (newCameraState) {
         await initializeLocalMedia();
      }
    }
  };

  const toggleMicrophone = async () => {
    const newMicState = !isMicOn;
    if (meetingRef.current && isConnected) { 
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
    setIsMicOn(newMicState); 
    if (!isConnected) { // Update preview if not in meeting
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = newMicState);
        } else if (newMicState) {
            await initializeLocalMedia(); // Re-init to get audio track if stream didn't exist
        }
    }
  };


  if (authLoading) { 
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p>Authenticating User...</p>
            {error && <p className="text-red-400 mt-2">{error}</p>}
        </div>
    );
  }
  
  if (!API_KEY_FROM_ENV) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-semibold">Video SDK Configuration Error</p>
            <p className="text-sm text-red-400">API Key is not set in environment variables.</p>
        </div>
    );
  }


  return (
    <>
      <Head>
        <title>Video Call - VideoSDK</title>
        <meta name="description" content="Video calling application with VideoSDK.live" />
      </Head>

      <div className="min-h-screen bg-gray-900 text-white">
        {!isConnected ? (
          <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="bg-gray-800 border-gray-700 shadow-xl w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">
                  {meetingIdToJoinParam && callerNameParam ? `Call from ${callerNameParam}` : (isCaller && calleeIdParam ? `Call User` : "Video Call")}
                </CardTitle>
                 <CardDescription className="text-gray-400">
                    {callStatus === "Initializing..." && sdkLoaded ? "Ready to join/create" : callStatus}
                 </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded-md text-sm flex items-center gap-2">
                    <AlertCircle size={18} /> {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="userName" className="text-sm font-medium text-gray-300">Your Name *</Label>
                  <Input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="bg-gray-700 border-gray-600 placeholder:text-gray-500 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter your name"
                    required
                  />
                </div>

                {meetingIdToJoinParam ? (
                    <div className="space-y-1">
                        <Label className="text-sm font-medium text-gray-300">Joining Meeting ID</Label>
                        <p className="text-lg font-semibold text-blue-400 bg-gray-700 p-2 rounded-md">{meetingId}</p>
                    </div>
                ) : 
                 (
                    <div className="space-y-2">
                        <Label htmlFor="meetingId" className="text-sm font-medium text-gray-300">Meeting ID</Label>
                         <div className="flex gap-2">
                            <Input
                            id="meetingId"
                            type="text"
                            value={meetingId}
                            onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                            className="flex-1 bg-gray-700 border-gray-600 placeholder:text-gray-500 focus:ring-blue-500 focus:border-blue-500"
                            placeholder={"Auto-generate or Enter ID"}
                            />
                            <Button
                                onClick={() => setMeetingId(generateRandomMeetingId())}
                                variant="outline"
                                className="bg-gray-600 hover:bg-gray-500 border-gray-500 text-gray-200"
                                size="icon"
                                aria-label="Generate Meeting ID"
                            >
                                <RefreshCw size={18} />
                            </Button>
                        </div>
                         {!isCaller && <p className="text-xs text-gray-400 mt-1">Leave blank to create a new meeting.</p>}
                    </div>
                )}

                <div className="flex items-center justify-start space-x-6 pt-2">
                    <div className="flex items-center space-x-2">
                        <Checkbox id="cameraOnJoin" checked={isCameraOn} onCheckedChange={(checked) => setIsCameraOn(!!checked)} className="border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                        <Label htmlFor="cameraOnJoin" className="text-sm text-gray-300">Camera On</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Checkbox id="micOnJoin" checked={isMicOn} onCheckedChange={(checked) => setIsMicOn(!!checked)} className="border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                        <Label htmlFor="micOnJoin" className="text-sm text-gray-300">Mic On</Label>
                    </div>
                </div>

                <Button
                  onClick={handleJoinMeeting}
                  disabled={isJoining || !sdkLoaded || !userName.trim() || (!meetingId.trim() && !isCaller && !meetingIdToJoinParam) || !authToken}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-medium py-3"
                  size="lg"
                >
                  {isJoining ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isJoining ? 'Connecting...' : (!authToken && API_KEY_FROM_ENV ? 'Preparing...' : (isCaller && calleeIdParam ? `Invite & Start Call` : "Join Meeting"))}
                </Button>
                
                <div className="mt-4">
                    <h3 className="text-xs font-medium text-gray-400 mb-1 text-center">Camera Preview</h3>
                    <div className="relative bg-black rounded-md overflow-hidden aspect-video border border-gray-700">
                        <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover transform scale-x-[-1]" 
                        />
                        {(!localStream || !isCameraOn) && ( 
                             <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center">
                                { !API_KEY_FROM_ENV ? <CameraOff className="h-10 w-10 text-red-400 mb-2" /> :
                                  !localStream && !error.includes("Camera/microphone access failed") ? <Loader2 className="h-8 w-8 animate-spin text-gray-500" /> :
                                  (isCameraOn && error.includes("Camera/microphone access failed")) ? <CameraOff className="h-10 w-10 text-red-400 mb-2" /> :
                                  !isCameraOn ? (
                                    <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-gray-600">
                                        <span className="text-2xl font-bold text-gray-400">
                                            {userName.charAt(0).toUpperCase() || '?'}
                                        </span>
                                    </div>
                                  ) : null
                                }
                                { API_KEY_FROM_ENV && isCameraOn && error.includes("Camera/microphone access failed") && <p className="text-sm text-red-400">{error}</p>}
                                { API_KEY_FROM_ENV && !isCameraOn && <p className="text-sm text-gray-400">Camera is off</p>}
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-4 text-xs text-gray-500 text-center">
                    <div>Auth Token: {authToken ? '✓ Ready' : (API_KEY_FROM_ENV ? '⏳ Loading...' : '✗ Not Configured')}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-screen flex flex-col">
            <header className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">Meeting ID: {meetingId}</h1>
                <Button variant="ghost" size="sm" onClick={() => {
                    navigator.clipboard.writeText(meetingId);
                    toast({title: "Meeting ID Copied!", description: meetingId});
                    }}
                    className="text-gray-300 hover:bg-gray-700 hover:text-white px-2"
                >
                    Copy ID
                </Button>
              </div>
               <div className="flex items-center gap-1.5 text-sm text-gray-300 bg-gray-700 px-2 py-1 rounded-md">
                  <Users size={16} />
                  <span>{participants.length + 1}</span> 
                </div>
            </header>
            
            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-gray-900">
              {isJoining && !isConnected && ( 
                <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
                  <div className="text-center">
                    <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p className="text-white">Connecting to meeting...</p>
                  </div>
                </div>
              )}
              <div id="video-sdk-container" ref={videoContainerRef} className="w-full h-full rounded-lg shadow-2xl border border-gray-700 bg-black">
                {/* VideoSDK will render participant videos here */}
              </div>
            </main>

            <footer className="bg-gray-800 p-3 border-t border-gray-700">
              <div className="flex justify-center items-center space-x-3 md:space-x-4">
                <Button
                  onClick={toggleMicrophone}
                  variant="outline"
                  size="lg"
                  className={`rounded-full p-3 aspect-square ${
                    isMicOn ? 'bg-gray-600 hover:bg-gray-500 border-gray-500' : 'bg-red-600 hover:bg-red-500 border-red-500'
                  } text-white`}
                  aria-label={isMicOn ? "Mute microphone" : "Unmute microphone"}
                >
                  {isMicOn ? <Mic className="h-5 w-5 md:h-6 md:w-6" /> : <MicOff className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>

                <Button
                  onClick={toggleCamera}
                  variant="outline"
                  size="lg"
                  className={`rounded-full p-3 aspect-square ${
                    isCameraOn ? 'bg-gray-600 hover:bg-gray-500 border-gray-500' : 'bg-red-600 hover:bg-red-500 border-red-500'
                  } text-white`}
                  aria-label={isCameraOn ? "Turn video off" : "Turn video on"}
                >
                  {isCameraOn ? <Camera className="h-5 w-5 md:h-6 md:w-6" /> : <CameraOff className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>
                
                <Button
                  onClick={() => handleLeaveMeeting(false)} 
                  variant="destructive"
                  size="lg"
                  className="rounded-full p-3 aspect-square"
                  aria-label="End call"
                >
                  <PhoneOff className="h-5 w-5 md:h-6 md:w-6" />
                </Button>
              </div>
            </footer>
          </div>
        )}
      </div>
    </>
  );
};

// Wrap the component content to use Suspense
export default function VideoSDKCallPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
        <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
        <p>Loading Video Call...</p>
      </div>
    }>
      <VideoSDKCallPageContent />
    </Suspense>
  )
}