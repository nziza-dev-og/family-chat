
"use client";

import { useState, useEffect, useRef, Suspense } from 'react';
import Head from 'next/head';
import { useSearchParams, useRouter } from 'next/navigation'; // Added useRouter
import { useAuth } from '@/hooks/useAuth'; // Added useAuth
import { useToast } from '@/hooks/use-toast'; // Added useToast
import { Button } from '@/components/ui/button'; // For styling
import { Input } from '@/components/ui/input'; // For styling
import { Checkbox } from '@/components/ui/checkbox'; // For styling
import { Label } from '@/components/ui/label'; // For styling
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'; // For styling
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Users, Loader2, RefreshCw, AlertCircle } from 'lucide-react'; // Icons
import { addMissedCallMessage } from '@/lib/chatActions'; // For missed calls
import { db } from '@/lib/firebase'; // For Firestore
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore'; // For Firestore


declare global {
  interface Window {
    VideoSDK: any;
  }
}

function VideoSDKCallPageContent() {
  const [sdkLoaded, setSdkLoaded] = useState(false); // To track SDK script loading
  const [isConnected, setIsConnected] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [meetingId, setMeetingId] = useState('');
  const [userName, setUserName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  // participants state was present in your example but not used by VideoSDK Prebuilt UI directly.
  // VideoSDK Prebuilt renders participants internally.
  // const [participants, setParticipants] = useState([]); 
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [authToken, setAuthToken] = useState('');
  
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


  // Use environment variable for API Key
  const API_KEY = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;
  // SECRET_KEY is only used server-side for token generation

  useEffect(() => {
    if (user && !authLoading) {
      setUserName(user.displayName || "Chat User");
    }
    if (meetingIdToJoinParam) {
      setMeetingId(meetingIdToJoinParam);
    }
    if (calleeIdParam) {
      setIsCaller(true);
    }
  }, [user, authLoading, meetingIdToJoinParam, calleeIdParam]);


  useEffect(() => {
    if (!API_KEY) {
        setError("Video SDK API Key is not configured. Video calls are disabled.");
        setSdkLoaded(false);
        return;
    }
    generateAuthToken(); // Fetch token as soon as component mounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_KEY]); // Re-fetch if API_KEY changes (though it shouldn't)

  // Generate authentication token
  const generateAuthToken = async () => {
    if (!API_KEY) {
      setError("Video SDK API Key is not configured.");
      return;
    }
    try {
      const response = await fetch('/api/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: API_KEY,
          // meetingId is optional here, can be set if you want token scoped to a meetingId from client
          // permissions: ['allow_join', 'allow_mod'] // These are defaults in the API route
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthToken(data.token);
        setError(''); // Clear previous errors
        return;
      }
      // If API route fails, try client-side (less secure, for demo)
      console.warn('API route for token generation failed or not available, status:', response.status);
      throw new Error(`API route token generation failed with status: ${response.status}`);

    } catch (error) {
      console.error('Token generation via API route failed:', error);
      console.log('Falling back to client-side token generation (INSECURE, FOR DEMO ONLY)');
      // Fallback to client-side token generation (INSECURE)
      try {
        const token = createClientSideToken();
        setAuthToken(token);
        toast({
            title: "Using Fallback Token",
            description: "Could not reach token server. Using a temporary client-side token (not for production).",
            variant: "destructive"
        });
      } catch (clientTokenError: any) {
          setError(`Failed to generate any token: ${clientTokenError.message}`);
          setAuthToken('');
      }
    }
  };

  const createClientSideToken = () => {
    if (!API_KEY) throw new Error("API Key missing for client-side token.");
    const payload = {
      apikey: API_KEY,
      permissions: ['allow_join', 'allow_mod'],
      version: 2,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    // This is a very simplified and insecure way to create a token-like structure.
    // DO NOT USE THIS IN PRODUCTION.
    const encodedHeader = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = btoa(JSON.stringify(payload));
    return `${encodedHeader}.${encodedPayload}.insecure_demo_signature_please_replace`;
  };

  // Create meeting using Video SDK API
  const createMeetingViaApi = async () => {
    if (!authToken) {
        setError("Auth token not available for creating meeting.");
        return null;
    }
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
      return data.roomId;
    } catch (error: any) {
      console.error('Error creating meeting via API:', error);
      setError(`Error creating meeting: ${error.message}`);
      // Fallback to generating a random meeting ID on client if API fails
      return generateRandomMeetingId();
    }
  };

  const generateRandomMeetingId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) { // Using 10 chars for a bit more randomness
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Initialize local media
  const initializeLocalMedia = async () => {
    // Stop any existing local stream tracks before starting new ones
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24 } // Adjusted frame rate
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
      return stream;
    } catch (error: any) {
      console.error('Error accessing media devices for preview:', error);
      setError(`Camera/microphone access failed: ${error.message}. Please check browser permissions.`);
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
      throw error;
    }
  };

  // Initialize media preview when component mounts or camera/mic toggles change (before joining)
  useEffect(() => {
    if (!isConnected && sdkLoaded) { // Only run preview if not connected and SDK script is conceptually loaded
        initializeLocalMedia();
    }
    // Cleanup for preview stream when component unmounts or dependencies change
    // This is important if the user toggles options before joining.
    return () => {
        if (localStream && !isConnected) { // Only stop preview stream if not in an active call
            localStream.getTracks().forEach(track => track.stop());
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected]); // Re-run if these change before joining

  // Join meeting using Video SDK prebuilt
  const handleJoinMeeting = async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!API_KEY) {
        setError("Video SDK API Key is not configured.");
        return;
    }
    if (!authToken) {
      setError('Authentication token not ready. Please wait and try again.');
      toast({ title: "Auth Token Missing", description: "Preparing session, please try again shortly.", variant: "destructive" });
      await generateAuthToken(); // Attempt to re-fetch token
      return;
    }

    setIsJoining(true);
    setError('');

    try {
      let finalMeetingId = meetingId.trim();
      if (!finalMeetingId && !meetingIdToJoinParam) { // Only create if not joining an existing one
        finalMeetingId = await createMeetingViaApi() || generateRandomMeetingId(); // Ensure it's always a string
        if (!finalMeetingId) {
          throw new Error("Failed to obtain a meeting ID.");
        }
        setMeetingId(finalMeetingId); // Update state if generated
      } else if (meetingIdToJoinParam) {
        finalMeetingId = meetingIdToJoinParam; // Use ID from invite
      }
      
      if (!finalMeetingId) {
          throw new Error("Meeting ID is required to join.");
      }
      
      if (isCaller && calleeIdParam && chatIdParam && user) {
        console.log(`[VideoSDK] Caller flow: Inviting ${calleeIdParam} to meeting ${finalMeetingId} for chat ${chatIdParam}`);
        const inviteRef = doc(db, "videoCallInvites", calleeIdParam);
        await updateDoc(inviteRef, { status: "cancelled" }).catch(() => {}); // Clear any old cancelled invite
        await deleteDoc(inviteRef).catch(() => {}); // Attempt to delete any previous invite first

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
        setInviteSent(true);
        toast({ title: "Calling...", description: `Inviting user to join meeting: ${finalMeetingId}`});
      }

      // Stop preview stream before VideoSDK takes over media
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        if(localVideoRef.current) localVideoRef.current.srcObject = null;
      }

      await loadAndInitializeVideoSDK(finalMeetingId);

    } catch (error: any) {
      console.error('Failed to join meeting:', error);
      setError(`Failed to join meeting: ${error.message}`);
      setIsJoining(false); // Ensure isJoining is reset on error
    }
  };

  const loadAndInitializeVideoSDK = async (currentMeetingId: string) => {
    return new Promise<any>((resolve, reject) => {
      if (!API_KEY) {
        reject(new Error("Video SDK API Key is not configured."));
        return;
      }
      const config = {
        name: userName,
        meetingId: currentMeetingId,
        apiKey: API_KEY,
        token: authToken, // Use the fetched/generated token
        
        containerId: 'video-sdk-container', // Ensure this div exists
        
        redirectOnLeave: false, // Handle leave manually
        
        micEnabled: isMicOn,
        webcamEnabled: isCameraOn,
        
        participantCanToggleSelfWebcam: true,
        participantCanToggleSelfMic: true,
        
        chatEnabled: true,
        screenShareEnabled: true,
        pollEnabled: false, // Simplified
        whiteboardEnabled: false,
        
        raiseHandEnabled: true,
        
        recordingEnabled: false, // Typically a paid feature / requires setup
        participantCanToggleRecording: false,
        
        brandingEnabled: false,
        poweredBy: false, // Control VideoSDK branding
        
        participantCanLeave: true,
        
        maxResolution: 'hd', // 'sd' or 'hd'
        
        debug: process.env.NODE_ENV === 'development', // Enable debug logs in dev
        
        theme: 'DARK', // DARK, LIGHT, DEFAULT
        mode: 'CONFERENCE', // CONFERENCE, GROUP
        multiStream: true, // Set true for group calls to see multiple videos
        
        layout: {
          type: 'SPOTLIGHT', // GRID, SPOTLIGHT, SIDEBAR
          priority: 'SPEAKER', // PIN, SPEAKER
          gridSize: 4,
        },
        
        joinScreen: {
          visible: true, // Show VideoSDK's join screen
          title: 'Video Call',
          meetingUrl: window.location.href, // Show current URL
        },
        
        permissions: {
          askToJoin: false, // false: direct join, true: knocking
          toggleParticipantMic: true,
          toggleParticipantWebcam: true,
          removeParticipant: true, // If host
          endMeeting: true, // If host
          drawOnWhiteboard: false,
          toggleWhiteboard: false,
          toggleRecording: false
        },
        callbacks: { // Adding callbacks for better state management
            'meeting-joined': () => {
                console.log('[VideoSDK] Meeting joined successfully');
                setIsConnected(true);
                setIsJoining(false);
                setError('');
                if (!isCaller && user) { // Callee updates invite status
                    updateDoc(doc(db, "videoCallInvites", user.uid), { status: 'answered', updatedAt: serverTimestamp() })
                    .catch(e => console.error("[VideoSDK] Error updating invite to answered:", e));
                }
                resolve(meetingRef.current);
            },
            'meeting-left': () => {
                console.log('[VideoSDK] Meeting left');
                setIsConnected(false); // Ensure isConnected is false
                handleLeaveMeeting(true); // Pass flag to avoid reload loop if called from here
            },
             'error': (err: any) => {
                console.error('[VideoSDK] Meeting error:', err);
                setError(`Meeting error: ${err.name} - ${err.message}`);
                setIsJoining(false);
                setIsConnected(false);
                reject(err);
            }
            // Add other event listeners like 'participant-joined', 'participant-left' if needed for custom UI updates
        }
      };

      const scriptId = 'videosdk-script';
      if (document.getElementById(scriptId)) { // If script already exists
        if (window.VideoSDK) {
            try {
                console.log('[VideoSDK] Script already loaded, initializing meeting...');
                const meeting = window.VideoSDK.initMeeting(config);
                meetingRef.current = meeting;
                // Callbacks within config will handle state updates
            } catch (initError: any) {
                console.error('[VideoSDK] Error re-initializing meeting:', initError);
                reject(new Error(`Meeting re-initialization failed: ${initError.message}`));
            }
        } else {
             console.warn('[VideoSDK] Script tag exists but window.VideoSDK not found. Re-attempting load.');
             document.getElementById(scriptId)?.remove(); // Remove old script to try reloading
             loadScriptTag(scriptId, config, resolve, reject);
        }
        return;
      }
      
      loadScriptTag(scriptId, config, resolve, reject);
    });
  };

  const loadScriptTag = (scriptId: string, config: any, resolve: Function, reject: Function) => {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      
      script.onload = () => {
        console.log('[VideoSDK] Script loaded via loadScriptTag, initializing...');
        setTimeout(() => { // Give SDK a moment
            if (window.VideoSDK) {
                try {
                    const meeting = window.VideoSDK.initMeeting(config);
                    meetingRef.current = meeting;
                     // Callbacks within config will handle state updates for joined/error.
                     // resolve(meeting); // resolve is handled by 'meeting-joined' callback now.
                } catch (initError: any) {
                    console.error('[VideoSDK] Error initializing meeting:', initError);
                    setError(`Meeting initialization failed: ${initError.message}`);
                    setIsJoining(false);
                    reject(initError);
                }
            } else {
                console.error('[VideoSDK] window.VideoSDK not found after script load (loadScriptTag).');
                setError('VideoSDK object not available after script load.');
                setIsJoining(false);
                reject(new Error('VideoSDK object not available'));
            }
        }, 500); // Short delay
      };
      script.onerror = (errorEvent) => {
        console.error('[VideoSDK] Failed to load Video SDK script:', errorEvent);
        setError('Failed to load Video SDK script. Check network or ad-blocker.');
        setIsJoining(false);
        reject(new Error('Failed to load Video SDK script'));
      };
      document.head.appendChild(script);
  }

  // Leave meeting
  const handleLeaveMeeting = (sdkInitiatedLeave = false) => { // Add flag
    if (meetingRef.current && !sdkInitiatedLeave) { // Only call leave if not already left via SDK event
      meetingRef.current.leave();
    }
    meetingRef.current = null; // Clear ref

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    
    const container = document.getElementById('video-sdk-container');
    if (container) container.innerHTML = ''; // Clear SDK UI

    setIsConnected(false);
    // setParticipants([]); // Participants managed by SDK
    
    if (isCaller && calleeIdParam && inviteSent && user && chatIdParam) {
      // If caller ends the call and invite was sent, delete invite
      deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
        .catch(e => console.warn("[VideoSDK] Error deleting invite on leave:", e));
      // Add missed call only if not connected (or if partner never joined)
      // This logic might need refinement based on actual participant join status from SDK
      if (!isJoining && !isConnected) { // Check if call was truly missed
          addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
      }
    }
    
    // Go back to chat page or home after leaving
    // setTimeout to allow SDK to finish its leave process if it initiated this.
    if (!sdkInitiatedLeave) { // Avoid reload loop if SDK initiated
        setTimeout(() => {
            router.replace(chatIdParam ? `/chats/${chatIdParam}` : '/chats');
        }, 300);
    } else {
        // If SDK initiated, we might just want to reset UI state without full navigation
        // or ensure navigation doesn't cause issues.
        // For now, this ensures we don't redirect if SDK's 'meeting-left' triggered this.
        setMeetingId(''); // Reset meeting ID to allow starting new call
        setIsJoining(false);
        setError('');
        setInviteSent(false);
    }
  };

  useEffect(() => {
    // Component unmount cleanup
    return () => {
        console.log("[VideoSDK] Component unmounting. Connected:", isConnected, "MeetingRef:", !!meetingRef.current);
        if (meetingRef.current && isConnected) { // If still connected, leave meeting
            meetingRef.current.leave();
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
         if (isCaller && calleeIdParam && inviteSent && user && chatIdParam && !isConnected) {
            // If caller unmounts while invite is ringing and not connected
            deleteDoc(doc(db, "videoCallInvites", calleeIdParam)).catch(e => console.warn("Error deleting invite on unmount:", e));
            addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream, isConnected, isCaller, calleeIdParam, chatIdParam, inviteSent, user]);


  // Toggle camera (SDK handles actual enabling/disabling if in meeting)
  const toggleCamera = async () => {
    const newCameraState = !isCameraOn;
    setIsCameraOn(newCameraState);
    if (meetingRef.current && isConnected) {
      if (newCameraState) meetingRef.current.unmuteWebcam(); // VideoSDK uses unmuteWebcam
      else meetingRef.current.disableWebcam();
    }
    // For preview, re-initialize media if not connected
    if (!isConnected) await initializeLocalMedia();
  };

  // Toggle microphone (SDK handles actual enabling/disabling if in meeting)
  const toggleMicrophone = async () => {
    const newMicState = !isMicOn;
    setIsMicOn(newMicState);
    if (meetingRef.current && isConnected) {
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
    // For preview, re-initialize media if not connected
    if (!isConnected) await initializeLocalMedia();
  };


  if (authLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p>Authenticating...</p>
        </div>
    );
  }
  // API_KEY check is done earlier

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
                <CardTitle className="text-2xl font-bold">Video Call</CardTitle>
                 {callerNameParam && meetingIdToJoinParam ? (
                    <CardDescription className="text-gray-400">Joining call from {callerNameParam}</CardDescription>
                 ) : isCaller && calleeIdParam ? (
                    <CardDescription className="text-gray-400">Starting call...</CardDescription>
                 ) : (
                    <CardDescription className="text-gray-400">Connect with VideoSDK.live</CardDescription>
                 )}
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded-md text-sm flex items-center gap-2">
                    <AlertCircle size={18} /> {error}
                  </div>
                )}
                {!API_KEY && (
                   <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded-md text-sm flex items-center gap-2">
                     <AlertCircle size={18} /> Video SDK API Key is not configured. Calls are disabled.
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

                {!meetingIdToJoinParam && ( // Only show if not joining via invite link
                    <div className="space-y-2">
                        <Label htmlFor="meetingId" className="text-sm font-medium text-gray-300">Meeting ID</Label>
                        <div className="flex gap-2">
                            <Input
                            id="meetingId"
                            type="text"
                            value={meetingId}
                            onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                            className="flex-1 bg-gray-700 border-gray-600 placeholder:text-gray-500 focus:ring-blue-500 focus:border-blue-500"
                            placeholder={isCaller ? "Generate or Enter ID" : "Enter meeting ID (optional)"}
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
                        <p className="text-xs text-gray-400 mt-1">Leave blank or click generate to create a new meeting.</p>
                    </div>
                )}
                 {meetingIdToJoinParam && (
                    <div className="space-y-1">
                        <Label className="text-sm font-medium text-gray-300">Meeting ID</Label>
                        <p className="text-lg font-semibold text-blue-400 bg-gray-700 p-2 rounded-md">{meetingId}</p>
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
                  disabled={isJoining || !userName.trim() || !authToken || !API_KEY}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-medium py-3"
                  size="lg"
                >
                  {isJoining ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isJoining ? 'Connecting...' : (!authToken && API_KEY ? 'Preparing...' : (isCaller && calleeIdParam ? `Invite & Start Call` : "Join Meeting"))}
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
                        {!localStream && !error.includes("Camera/microphone access failed") && !error.includes("Video SDK API Key is not configured") && ( 
                             <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                            </div>
                        )}
                        {localStream && !isCameraOn && (
                            <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-gray-600">
                                <span className="text-2xl font-bold text-gray-400">
                                    {userName.charAt(0).toUpperCase() || '?'}
                                </span>
                                </div>
                                <p className="text-sm text-gray-400">Camera is off</p>
                            </div>
                        )}
                         {(error.includes("Camera/microphone access failed") || error.includes("Video SDK API Key is not configured")) && ( 
                            <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center p-4">
                                <CameraOff className="h-10 w-10 text-red-400 mb-2" />
                                <p className="text-sm text-red-400">{error}</p>
                                <p className="text-xs text-gray-500 mt-1">Check browser permissions or refresh.</p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-4 text-xs text-gray-500 text-center">
                    <div>Auth Token: {authToken ? '✓ Ready' : (API_KEY ? '⏳ Loading...' : '✗ Not Configured')}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Video Call Interface
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
                    <Copy size={14} className="mr-1.5"/> Copy ID
                </Button>
              </div>
               <div className="flex items-center gap-1.5 text-sm text-gray-300 bg-gray-700 px-2 py-1 rounded-md">
                  <Users size={16} />
                  {/* Participant count comes from SDK UI or custom listeners if needed */}
                  <span>{meetingRef.current?.participants?.size + 1 || 1}</span> 
                </div>
            </header>

            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-gray-900">
              {isJoining && !isConnected && ( // Show loading overlay only when actively joining and not yet connected
                <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
                  <div className="text-center">
                    <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p className="text-white">Connecting to meeting...</p>
                  </div>
                </div>
              )}
              {/* VideoSDK Prebuilt UI will render here */}
              <div id="video-sdk-container" ref={videoContainerRef} className="w-full h-full rounded-lg shadow-2xl border border-gray-700"></div>
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
}


export default function VideoSDKCallPage() {
  return (
    // Suspense is needed because VideoSDKCallPageContent uses useSearchParams
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

// pages/api/generate-token.ts
import jwt from 'jsonwebtoken';
import type { NextApiRequest, NextApiResponse } from 'next';

interface TokenResponse {
  token?: string;
  message?: string;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<TokenResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Client sends apiKey, but we use the server-side SECRET_KEY for signing
  const { apiKey, permissions: reqPermissions, meetingId: reqMeetingId } = req.body;
  const videoSDKApiKey = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;
  const secretKey = process.env.VIDEOSDK_SECRET_KEY;

  if (!videoSDKApiKey || !secretKey) {
    console.error("API key or Secret key is missing from environment variables.");
    return res.status(500).json({ message: 'Server configuration error for VideoSDK keys.' });
  }

  // Optional: Validate apiKey from client against server's apiKey if needed,
  // but primary security comes from using the server-side secretKey for signing.
  if (apiKey !== videoSDKApiKey) {
     console.warn("Client API key does not match server's public API key. Proceeding with server's key for token.");
     // This is more of a sanity check or logging point. The token will be signed with the server's credentials.
  }

  try {
    const payload: {
        apikey: string;
        permissions: string[];
        version: number;
        exp: number;
        meetingId?: string; // Optional meetingId
    } = {
      apikey: videoSDKApiKey, // Use the server's API key for the token payload
      permissions: reqPermissions || ['allow_join', 'allow_mod'], // Default permissions
      version: 2, // SDK version
      exp: Math.floor(Date.now() / 1000) + (60 * 60), // Token expiry: 1 hour from now
    };

    if (reqMeetingId) {
      payload.meetingId = reqMeetingId;
    }

    const token = jwt.sign(payload, secretKey, { algorithm: 'HS256' });

    res.status(200).json({ token });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ message: 'Failed to generate VideoSDK token' });
  }
}