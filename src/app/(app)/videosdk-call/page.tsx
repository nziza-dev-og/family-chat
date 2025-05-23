
"use client";

import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
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
import { db } from '@/lib/firebase'; // For potential invite updates
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore'; // For invite updates

// Declare VideoSDK on window type
declare global {
  interface Window {
    VideoSDK: any;
  }
}

function VideoSDKCallPageContent() {
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
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [callStatus, setCallStatus] = useState('Initializing...');

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
  
  const [isCaller, setIsCaller] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const API_KEY_FROM_ENV = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;

  const generateAuthTokenInternal = useCallback(async (currentMeetingId?: string) => {
    if (!API_KEY_FROM_ENV) {
      setError("Video SDK API Key is not configured. Cannot generate token.");
      setCallStatus("Configuration Error");
      return;
    }
    setCallStatus("Generating token...");
    try {
      const response = await fetch('/api/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: API_KEY_FROM_ENV,
          permissions: ['allow_join', 'allow_mod'],
          meetingId: currentMeetingId || undefined
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthToken(data.token);
        setCallStatus("Token Ready");
        setError('');
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
      console.warn(detailedErrorMessage);
      throw new Error(detailedErrorMessage);

    } catch (apiError: any) {
      console.error('Token generation via API route failed:', apiError);
      if (API_KEY_FROM_ENV) {
        console.warn('Falling back to client-side token generation (INSECURE, FOR DEMO ONLY)');
        try {
          const token = createClientSideToken();
          setAuthToken(token);
          toast({
              title: "Using Fallback Token",
              description: "Could not reach token server. Using a temporary client-side token (not for production).",
              variant: "destructive"
          });
          setError('');
          setCallStatus("Token Ready (Fallback)");
        } catch (clientTokenError: any) {
            setError(`Failed to generate any token: ${clientTokenError.message}`);
            setCallStatus("Token Error");
        }
      } else {
         setError(apiError.message || "Failed to generate token. API Key might be missing.");
         setCallStatus("Token Error / Config Error");
      }
    }
  }, [API_KEY_FROM_ENV, toast]);

  useEffect(() => {
    if (API_KEY_FROM_ENV) {
      generateAuthTokenInternal(); // Generate initial token without meetingId
    } else {
      setError("Video SDK API Key is not configured. Video calls are disabled.");
      setCallStatus("Configuration Error");
      setSdkLoaded(false);
    }
  }, [API_KEY_FROM_ENV, generateAuthTokenInternal]);
  
  useEffect(() => {
    if (user && !authLoading) {
      setUserName(user.displayName || "Chat User");
    }
    if (meetingIdToJoinParam) {
      setMeetingId(meetingIdToJoinParam);
      setCallStatus("Ready to join invited meeting");
    }
    if (calleeIdParam) {
      setIsCaller(true);
    }
  }, [user, authLoading, meetingIdToJoinParam, calleeIdParam]);

  const createClientSideToken = useCallback(() => {
    if (!API_KEY_FROM_ENV) throw new Error("API Key missing for client-side token.");
    const payload = {
      apikey: API_KEY_FROM_ENV,
      permissions: ['allow_join', 'allow_mod'],
      version: 2,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    const encodedPayload = btoa(JSON.stringify(payload));
    return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${encodedPayload}.demo_signature_videosdk_live`;
  }, [API_KEY_FROM_ENV]);

  const createMeetingViaApi = useCallback(async () => {
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
      console.log("Meeting created via API:", data);
      setCallStatus("Meeting room created");
      return data.roomId;
    } catch (error: any) {
      console.error('Error creating meeting via API:', error);
      setError(`Error creating meeting: ${error.message}`);
      setCallStatus("Meeting Creation Error");
      return generateRandomMeetingId();
    }
  }, [authToken]);

  const generateRandomMeetingId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const initializeLocalMediaInternal = useCallback(async () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    if (!isCameraOn && !isMicOn && !isConnected) {
      setCallStatus("Media devices off");
      setLocalStream(null);
      return null;
    }
    
    setCallStatus("Accessing media...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } : false,
        audio: isMicOn ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false
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
      setLocalStream(null);
      throw error;
    }
  }, [isCameraOn, isMicOn, isConnected, localStream]);

  useEffect(() => {
    if (!isConnected && sdkLoaded && API_KEY_FROM_ENV && !authLoading) {
      initializeLocalMediaInternal().catch(e => console.warn("Initial media preview failed:", e.message));
    }
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected, API_KEY_FROM_ENV, authLoading, initializeLocalMediaInternal]);

  const actualJoinMeeting = useCallback(async (currentMeetingId: string) => {
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
      // Attempt to generate token if missing, specifically for this meeting ID
      await generateAuthTokenInternal(currentMeetingId);
      // Need to re-check authToken after attempt
      if (!authToken) { // This check might use stale authToken, consider passing the new token
        setError("Authentication token not available. Cannot join meeting.");
        setIsJoining(false);
        setCallStatus("Token Error");
        return;
      }
    }

    setCallStatus("Joining meeting...");

    const config = {
      name: userName,
      meetingId: currentMeetingId,
      apiKey: API_KEY_FROM_ENV,
      token: authToken, // Use the state authToken
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
      layout: { type: 'SPOTLIGHT', priority: 'SPEAKER', gridSize: 4 },
      joinScreen: { visible: true, title: 'Video Call', meetingUrl: typeof window !== "undefined" ? window.location.href : "" },
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
          if (!isCaller && user && meetingIdToJoinParam && videoContainerRef.current) {
              try {
                  const inviteDocRef = doc(db, "videoCallInvites", user.uid);
                  const inviteSnap = await getDoc(inviteDocRef);
                  if(inviteSnap.exists() && inviteSnap.data()?.meetingId === currentMeetingId) {
                     await updateDoc(inviteDocRef, { status: 'answered', updatedAt: serverTimestamp() });
                     console.log(`[VideoSDK] Invite for ${user.uid} updated to answered.`);
                  }
              } catch (e) { console.error("[VideoSDK] Error updating invite to answered:", e); }
          }
        },
        'meeting-left': () => {
          console.log('[VideoSDK] Meeting left callback triggered');
          handleLeaveMeetingInternal(true);
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
      if (!document.getElementById(config.containerId) && videoContainerRef.current) {
        const container = document.createElement('div');
        container.id = config.containerId;
        container.className = "w-full h-full";
        videoContainerRef.current.innerHTML = ''; // Clear previous SDK instances if any
        videoContainerRef.current.appendChild(container);
      } else if (!document.getElementById(config.containerId)) {
        console.error(`[VideoSDK] Container with id '${config.containerId}' not found.`);
        setError(`Video container not found.`);
        setCallStatus("UI Error");
        setIsJoining(false);
        return;
      }

      const meeting = window.VideoSDK.initMeeting(config);
      meetingRef.current = meeting;
      // If joinScreen.visible is true, VideoSDK handles showing its own join UI.
      // If you want to bypass that and join programmatically, set joinScreen.visible to false
      // and then call: meeting.join();
    } catch (initError: any) {
      console.error('[VideoSDK] Error initializing meeting:', initError);
      setError(`Meeting initialization failed: ${initError.message}`);
      setCallStatus("Initialization Error");
      setIsJoining(false);
    }
  }, [API_KEY_FROM_ENV, authToken, userName, isMicOn, isCameraOn, sdkLoaded, isCaller, user, meetingIdToJoinParam, generateAuthTokenInternal]);

  const handleJoinMeetingInternal = useCallback(async () => {
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
      await generateAuthTokenInternal(meetingId.trim() || meetingIdToJoinParam); // Pass meetingId for token generation
      return; // Wait for token to be set by the effect
    }

    setIsJoining(true);
    setError('');
    setCallStatus("Preparing to join...");

    try {
      let finalMeetingId = meetingId.trim();
      
      if (isCaller && calleeIdParam && chatIdParam && user) {
        if (!finalMeetingId) {
          finalMeetingId = await createMeetingViaApi() || generateRandomMeetingId();
          setMeetingId(finalMeetingId);
        }
        setCallStatus("Sending invite...");
        const inviteRef = doc(db, "videoCallInvites", calleeIdParam);
        await updateDoc(inviteRef, { status: 'answered', updatedAt: serverTimestamp() }).catch(async () => {
            await doc(db, "videoCallInvites", calleeIdParam).set({
                 callerId: user.uid,
                 callerName: user.displayName || "A user",
                 callerAvatar: user.photoURL || "",
                 meetingId: finalMeetingId,
                 status: 'ringing',
                 createdAt: serverTimestamp(),
                 chatId: chatIdParam,
                 callType: 'videosdk'
            });
        });
        setInviteSent(true);
        toast({ title: "Calling...", description: `Inviting user to join meeting: ${finalMeetingId}`});
      } else if (!finalMeetingId && !meetingIdToJoinParam) {
        finalMeetingId = await createMeetingViaApi() || generateRandomMeetingId();
        setMeetingId(finalMeetingId);
      } else if (meetingIdToJoinParam) {
        finalMeetingId = meetingIdToJoinParam;
      }
      
      if (!finalMeetingId) throw new Error("Meeting ID is required to join.");
      
      await initializeLocalMediaInternal();
      await actualJoinMeeting(finalMeetingId);

    } catch (error: any) {
      console.error('Failed to join meeting (handleJoinMeetingInternal):', error);
      setError(`Failed to join meeting: ${error.message}`);
      setCallStatus("Join Error");
      setIsJoining(false);
    }
  }, [userName, API_KEY_FROM_ENV, authToken, generateAuthTokenInternal, meetingId, isCaller, calleeIdParam, chatIdParam, user, createMeetingViaApi, meetingIdToJoinParam, initializeLocalMediaInternal, actualJoinMeeting, toast]);

  const handleLeaveMeetingInternal = useCallback((sdkInitiatedLeave = false) => {
    console.log(`[VideoSDK] handleLeaveMeetingInternal. SDK initiated: ${sdkInitiatedLeave}, Connected: ${isConnected}`);
    if (meetingRef.current && !sdkInitiatedLeave && isConnected) {
      try { meetingRef.current.leave(); } catch (e) { console.warn("[VideoSDK] Error during meetingRef.current.leave():", e); }
    }
    meetingRef.current = null;

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (videoContainerRef.current) videoContainerRef.current.innerHTML = '';
    
    const wasConnected = isConnected;
    setIsConnected(false);
    setParticipants([]);
    setCallStatus("Disconnected");
    
    // Missed call logic related to invites can be added here
    
    if (!sdkInitiatedLeave) {
        setTimeout(() => {
          if (document.visibilityState === 'visible') {
            router.replace(chatIdParam ? `/chats/${chatIdParam}` : '/chats');
          }
        }, 300);
    } else {
        setMeetingId('');
        setIsJoining(false);
        setInviteSent(false);
        if (API_KEY_FROM_ENV) generateAuthTokenInternal();
    }
  }, [isConnected, localStream, router, chatIdParam, API_KEY_FROM_ENV, generateAuthTokenInternal]);

  useEffect(() => {
    return () => {
      if (meetingRef.current && isConnected) {
        try { meetingRef.current.leave(); } catch(e) { console.warn("Error during meeting.leave() on unmount:", e); }
        meetingRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isConnected, localStream]);

  const toggleCameraInternal = useCallback(async () => {
    const newCameraState = !isCameraOn;
    if (meetingRef.current && isConnected) {
      if (newCameraState) meetingRef.current.unmuteWebcam();
      else meetingRef.current.disableWebcam();
    }
    setIsCameraOn(newCameraState);
    if (!isConnected) await initializeLocalMediaInternal();
  }, [isCameraOn, isConnected, initializeLocalMediaInternal]);

  const toggleMicrophoneInternal = useCallback(async () => {
    const newMicState = !isMicOn;
    if (meetingRef.current && isConnected) {
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
    setIsMicOn(newMicState);
    if (!isConnected) await initializeLocalMediaInternal();
  }, [isMicOn, isConnected, initializeLocalMediaInternal]);

  useEffect(() => {
    if (!API_KEY_FROM_ENV) {
      setError("Video SDK API Key is not configured. Video calls are disabled.");
      setCallStatus("Configuration Error");
      setSdkLoaded(false);
      return;
    }

    const scriptId = 'videosdk-script';
    if (document.getElementById(scriptId) && window.VideoSDK) {
      setSdkLoaded(true);
      setCallStatus(prev => prev === "Initializing..." || prev === "SDK Loading..." ? "SDK Loaded" : prev);
      return;
    }
    
    setCallStatus("SDK Loading...");
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
    script.async = true;
    script.crossOrigin = 'anonymous';

    const handleScriptLoad = () => {
      if (window.VideoSDK) {
        setSdkLoaded(true);
        setCallStatus(prev => prev === "SDK Loading..." ? "SDK Loaded" : prev);
      } else {
        setTimeout(() => {
          if (window.VideoSDK) {
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
         // document.head.removeChild(existingScript); // Consider if script removal is desired
      }
    };
  }, [API_KEY_FROM_ENV]);

  const generateMeetingIdOnClick = () => {
    setMeetingId(generateRandomMeetingId());
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
  
  if (!API_KEY_FROM_ENV && !error.includes("Configuration Error")) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-semibold">Video SDK Configuration Error</p>
            <p className="text-sm text-red-400">API Key is not set in environment variables.</p>
        </div>
    );
  }

  if ((!sdkLoaded && !error.includes("SDK Error") && API_KEY_FROM_ENV) || (!authToken && !error.includes("Token Error") && API_KEY_FROM_ENV)) {
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p>Loading Video Call Interface... ({callStatus})</p>
            {error && <p className="text-red-400 mt-2">{error}</p>}
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
                   {meetingIdToJoinParam && callerNameParam ? `Call from ${callerNameParam}` : (isCaller && calleeIdParam && user ? `Invite User to Call` : "Video Call")}
                </CardTitle>
                 <CardDescription className="text-gray-400">
                    {callStatus}
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

                {(!meetingIdToJoinParam || (isCaller && calleeIdParam)) && (
                    <div className="space-y-2">
                        <Label htmlFor="meetingIdInput" className="text-sm font-medium text-gray-300">Meeting ID</Label>
                         <div className="flex gap-2">
                            <Input
                            id="meetingIdInput"
                            type="text"
                            value={meetingId}
                            onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                            className="flex-1 bg-gray-700 border-gray-600 placeholder:text-gray-500 focus:ring-blue-500 focus:border-blue-500"
                            placeholder={isCaller ? "Auto-generate or Enter ID" : "Enter Meeting ID"}
                            disabled={!!meetingIdToJoinParam && !isCaller}
                            />
                            <Button
                                onClick={generateMeetingIdOnClick}
                                variant="outline"
                                className="bg-gray-600 hover:bg-gray-500 border-gray-500 text-gray-200"
                                size="icon"
                                aria-label="Generate Meeting ID"
                                disabled={!!meetingIdToJoinParam && !isCaller}
                            >
                                <RefreshCw size={18} />
                            </Button>
                        </div>
                         <p className="text-xs text-gray-400 mt-1">
                            {isCaller ? "Leave blank to auto-generate when inviting." : (meetingIdToJoinParam ? `Joining: ${meetingIdToJoinParam}` : "Or leave blank to create a new one.")}
                         </p>
                    </div>
                )}
                {meetingIdToJoinParam && !isCaller && (
                     <div className="space-y-1">
                        <Label className="text-sm font-medium text-gray-300">Joining Meeting ID</Label>
                        <p className="text-lg font-semibold text-blue-400 bg-gray-700 p-2 rounded-md">{meetingIdToJoinParam}</p>
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
                  onClick={handleJoinMeetingInternal}
                  disabled={isJoining || !sdkLoaded || !userName.trim() || (!meetingId.trim() && !isCaller && !meetingIdToJoinParam) || !authToken}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-medium py-3"
                  size="lg"
                >
                  {isJoining ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isJoining ? 'Connecting...' : (!authToken && API_KEY_FROM_ENV ? 'Preparing...' : (isCaller && calleeIdParam && user ? `Invite & Start Call` : "Join Meeting"))}
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
                                            {userName.charAt(0).toUpperCase() || (user?.displayName?.charAt(0).toUpperCase() || '?')}
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
                    <div>Meeting ID: {meetingId || (isCaller ? "Will be generated" : "Enter or join invited")}</div>
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
              <div 
                id="video-sdk-container"
                ref={videoContainerRef}
                className="w-full h-full rounded-lg shadow-2xl border border-gray-700 bg-black"
              />
              {isJoining && !isConnected && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
                  <div className="text-center">
                    <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p className="text-white">Connecting to meeting...</p>
                  </div>
                </div>
              )}
            </main>

            <footer className="bg-gray-800 p-3 border-t border-gray-700">
              <div className="flex justify-center items-center space-x-3 md:space-x-4">
                <Button
                  onClick={toggleMicrophoneInternal}
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
                  onClick={toggleCameraInternal}
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
                  onClick={() => handleLeaveMeetingInternal(false)}
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
}

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
  );
}

    