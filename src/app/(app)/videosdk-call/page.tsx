
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
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Users, Loader2, RefreshCw, AlertCircle } from 'lucide-react'; // Added Users
import { addMissedCallMessage } from '@/lib/chatActions';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';

// Ensure window.VideoSDK is declared for TypeScript if not already globally typed
declare global {
  interface Window {
    VideoSDK: any;
  }
}


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
  const callerNameParam = searchParams.get('callerName'); // Used to display who is calling

  const [isCaller, setIsCaller] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  
  const API_KEY_FROM_ENV = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;

  // Effect for generating auth token
  useEffect(() => {
    if (!API_KEY_FROM_ENV) {
        setError("Video SDK API Key is not configured. Video calls are disabled.");
        setCallStatus("Configuration Error");
        setSdkLoaded(false); // Ensure SDK loading doesn't proceed if no key
        return;
    }
    setCallStatus("Generating token...");
    generateAuthToken();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_KEY_FROM_ENV]); // Only depends on API_KEY_FROM_ENV

  useEffect(() => {
    if (user && !authLoading) {
      setUserName(user.displayName || "Chat User");
    }
    if (meetingIdToJoinParam) {
      setMeetingId(meetingIdToJoinParam);
      // If joining an existing meeting, we might want to initialize media earlier
      // But let's keep it within handleJoinMeeting for consistency unless issues arise
    }
    if (calleeIdParam) {
      setIsCaller(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, meetingIdToJoinParam, calleeIdParam]);

  // Effect for loading VideoSDK script
  useEffect(() => {
    if (!API_KEY_FROM_ENV) { // Don't load script if API key is missing
        return; 
    }

    const scriptId = 'videosdk-script';
    if (document.getElementById(scriptId)) {
      if (window.VideoSDK) {
        console.log('Video SDK script already loaded and available.');
        setSdkLoaded(true);
        setCallStatus(prev => prev === "Initializing..." || prev === "SDK Loading..." ? "SDK Loaded" : prev);
      } else {
        console.warn('Video SDK script tag found, but window.VideoSDK not ready. Waiting for onload.');
         // It's possible onload was missed if script was added by another instance or too quickly
      }
      return; 
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
        }, 2000); // Increased delay slightly
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
      // VideoSDK docs sometimes suggest not removing the script to avoid issues if multiple components try to load it.
      // However, if this page is the sole loader, cleanup might be desired.
      // For now, let's leave it, as removing it while it's being used by the SDK could cause problems.
      // const existingScript = document.getElementById(scriptId);
      // if (existingScript && document.head.contains(existingScript)) {
      //   document.head.removeChild(existingScript);
      // }
      if (meetingRef.current && isConnected) {
        meetingRef.current.leave();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_KEY_FROM_ENV]); // Only depend on API_KEY_FROM_ENV

  // Generate authentication token
  const generateAuthToken = async () => {
    if (!API_KEY_FROM_ENV) { // Ensure API key is available
        setError("Video SDK API Key is not configured. Cannot generate token.");
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
          apiKey: API_KEY_FROM_ENV, // Send the public API key
          // secretKey is NOT sent from client; server uses its own env var
          permissions: ['allow_join', 'allow_mod'],
          meetingId: meetingId || undefined // Send meetingId if available (optional for token)
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthToken(data.token);
        setError(''); // Clear previous errors
        setCallStatus(prev => prev.includes("Token") ? "Token Ready" : prev); // Update status without overwriting SDK loaded status
        return;
      }
      
      // Try to parse error from API route
      let detailedErrorMessage = `API route token generation failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          detailedErrorMessage += `. Server: "${errorData.message}"`;
        }
      } catch (parseError) {
        // If parsing fails, use the status text
        detailedErrorMessage += `. ${response.statusText || 'Could not retrieve error details from server.'}`;
      }
      console.error(detailedErrorMessage);
      throw new Error(detailedErrorMessage);

    } catch (error: any) {
      console.error('Token generation via API route failed:', error);
      // Fallback to client-side token generation only if API route fails and it's not a server config issue
      if (error.message && !error.message.includes("Server configuration error")) {
        console.warn('Falling back to client-side token generation (INSECURE, FOR DEMO ONLY)');
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
  
  // Fallback token creation (simplified for demo, NOT FOR PRODUCTION)
  const createClientSideToken = () => {
    if (!API_KEY_FROM_ENV) throw new Error("API Key missing for client-side token.");
    const payload = {
      apikey: API_KEY_FROM_ENV,
      permissions: ['allow_join', 'allow_mod'],
      version: 2,
      exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    // This is a placeholder and NOT a secure JWT.
    const encodedHeader = btoa(JSON.stringify({alg: "HS256", typ: "JWT"}));
    const encodedPayload = btoa(JSON.stringify(payload));
    return `${encodedHeader}.${encodedPayload}.insecure_demo_signature_please_replace`;
  };

  // Create meeting using Video SDK API
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
        // body: JSON.stringify({ // region: 'sg001' // Optional: specify region
        //   webhook: { // Optional
        //     end_point: "YOUR_WEBHOOK_ENDPOINT",
        //     events: ["PARTICIPANT_JOINED", "PARTICIPANT_LEFT"]
        //   }
        // })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to get error message
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
      return generateRandomMeetingId(); // Fallback to random ID if API fails
    }
  };

  const generateRandomMeetingId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) { // Using 10 chars for a bit more uniqueness
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Initialize local media for preview
  const initializeLocalMedia = async () => {
    if (localStream && localStream.active) {
      // If camera/mic state has changed, re-get with new constraints
      // This is tricky because changing constraints usually requires stopping old tracks
      // For simplicity, let's assume SDK handles this post-join or we re-init if major change
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
          width: { ideal: 1280, max: 1920 }, // Standard HD
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 24 } // Common frame rate
        } : false,
        audio: isMicOn ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : false // Only request audio if mic is intended to be on
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
      if(localVideoRef.current) localVideoRef.current.srcObject = null; // Clear preview on error
      throw error; // Re-throw to be caught by handleJoinMeeting
    }
  };

  // Effect to initialize local media for preview when component mounts or camera/mic toggles change *before* joining
  useEffect(() => {
    if (!isConnected && sdkLoaded && API_KEY_FROM_ENV && !authLoading) { // ensure user is also loaded if name is prefilled
        initializeLocalMedia().catch(e => console.warn("Initial media preview failed, user might need to grant permissions."));
    }
    // This effect is for pre-join preview.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected, API_KEY_FROM_ENV, authLoading]); // Rerun if camera/mic toggles change state before join

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

    // Stop local preview stream before SDK takes over, if it exists and is active
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null); // SDK will manage its own stream
        if(localVideoRef.current) localVideoRef.current.srcObject = null;
    }
    setCallStatus("Joining meeting...");

    // VideoSDK Configuration
    const config = {
      name: userName,
      meetingId: currentMeetingId,
      apiKey: API_KEY_FROM_ENV, // Use the key from environment
      token: authToken, // Pass the generated token
      
      containerId: 'video-sdk-container', // Ensure this div exists in your JSX
      redirectOnLeave: false, // Keep user on the page
      
      micEnabled: isMicOn,
      webcamEnabled: isCameraOn,
      
      participantCanToggleSelfWebcam: true,
      participantCanToggleSelfMic: true,
      
      chatEnabled: true,
      screenShareEnabled: true,
      pollEnabled: false, // Disabled as per example
      whiteboardEnabled: false, // Disabled as per example
      
      raiseHandEnabled: true,
      
      recordingEnabled: false, // Configure as needed
      participantCanToggleRecording: false,
      
      brandingEnabled: false,
      poweredBy: false, // Hides "Powered by VideoSDK"
      
      participantCanLeave: true, // Or false to disable the leave button from SDK UI
      
      maxResolution: 'hd', // 'sd' or 'hd'
      
      debug: process.env.NODE_ENV === 'development', // Enable debug logs in dev
      
      theme: 'DARK', // DARK, LIGHT, DEFAULT
      mode: 'CONFERENCE', // CONFERENCE, GROUP
      multiStream: true, // true for multiple video streams, false for active speaker mode
      
      layout: {
        type: 'SPOTLIGHT', // GRID, SPOTLIGHT, SIDEBAR
        priority: 'SPEAKER', // PIN, SPEAKER
        gridSize: 4, // Max number of videos in grid view
      },
      
      joinScreen: {
        visible: true, // Show VideoSDK's default join screen
        title: 'Video Call',
        meetingUrl: typeof window !== "undefined" ? window.location.href : "", // Or your custom meeting link
      },
      
      permissions: {
        askToJoin: false, // false: participants join directly, true: host approval needed
        toggleParticipantMic: true, // Allow host to mute/unmute others
        toggleParticipantWebcam: true, // Allow host to enable/disable others' video
        removeParticipant: true, // Allow host to remove participants
        endMeeting: true, // Allow host to end meeting for all
        drawOnWhiteboard: false,
        toggleWhiteboard: false,
        toggleRecording: false
      },
      callbacks: {
          'meeting-joined': async () => {
              console.log('[VideoSDK] Meeting joined successfully');
              setIsConnected(true);
              setIsJoining(false);
              setError('');
              setCallStatus("Connected");
              if (!isCaller && user && meetingIdToJoinParam && chatIdParam) { // If callee joins
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
              handleLeaveMeeting(true); // Pass true to indicate SDK initiated leave
          },
           'error': (err: any) => {
              console.error('[VideoSDK] Meeting error:', err);
              setError(`Meeting error: ${err.name || 'Unknown'} - ${err.message || 'An error occurred'}`);
              setCallStatus("Meeting Error");
              setIsJoining(false);
              setIsConnected(false); // Ensure disconnected state on error
          },
          'participant-joined': (participant: any) => {
            console.log('[VideoSDK] Participant joined:', participant);
            setParticipants(prev => [...prev, participant]);
          },
          'participant-left': (participant: any) => {
            console.log('[VideoSDK] Participant left:', participant);
            setParticipants(prev => prev.filter(p => p.id !== participant.id));
          },
          // You can add more callbacks as needed, e.g., for stream changes
      }
    };

    try {
      // Ensure the container div exists before initializing
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
      // meeting.join(); // If joinScreen.visible is true, SDK handles the join on its screen
      // If joinScreen.visible is false, you would call meeting.join() here.
    } catch (initError: any) {
      console.error('[VideoSDK] Error initializing meeting with window.VideoSDK.initMeeting:', initError);
      setError(`Meeting initialization failed: ${initError.message}`);
      setCallStatus("Initialization Error");
      setIsJoining(false);
    }
  };

  // Main function to handle joining/creating a meeting
  const handleJoinOrCreateMeeting = async () => {
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
      // Attempt to re-generate token if missing, respecting API_KEY_FROM_ENV check
      if (!API_KEY_FROM_ENV) { 
        setError("Video SDK API Key is not configured. Cannot generate token.");
      } else {
        await generateAuthToken(); // This will set authToken or an error
      }
      return;
    }

    setIsJoining(true);
    setError('');
    setCallStatus("Preparing to join...");

    try {
      let finalMeetingId = meetingId.trim();
      
      if (isCaller && calleeIdParam && chatIdParam && user) { // Caller flow: inviting someone
        if (!finalMeetingId) { // If caller didn't provide one, create one
            finalMeetingId = await createMeetingViaApi();
            if (!finalMeetingId) throw new Error("Failed to obtain a meeting ID for inviting.");
            setMeetingId(finalMeetingId); // Update state with the new ID
        }
        setCallStatus("Sending invite...");
        console.log(`[VideoSDK] Caller flow: Inviting ${calleeIdParam} to meeting ${finalMeetingId} for chat ${chatIdParam}`);
        const inviteRef = doc(db, "videoCallInvites", calleeIdParam);
        
        // Check for existing ringing invite for the same callee to avoid duplicate notifications
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists() && inviteSnap.data()?.status === 'ringing') {
            // Potentially update existing invite or show a warning. For now, let's overwrite.
            console.warn(`[VideoSDK] An existing ringing invite found for ${calleeIdParam}. Overwriting.`);
        }
        
        await setDoc(inviteRef, {
            callerId: user.uid,
            callerName: user.displayName || "A user",
            callerAvatar: user.photoURL || "",
            meetingId: finalMeetingId,
            status: 'ringing',
            createdAt: serverTimestamp(),
            chatId: chatIdParam, // For missed call message context
            callType: 'videosdk' // Differentiate from WebRTC calls
        });
        setInviteSent(true);
        toast({ title: "Calling...", description: `Inviting user to join meeting: ${finalMeetingId}`});
      } else if (!finalMeetingId && !meetingIdToJoinParam) { // Not a caller inviting, and no ID provided to join (create new meeting)
        finalMeetingId = await createMeetingViaApi();
        if (!finalMeetingId) {
            throw new Error("Failed to obtain a meeting ID.");
        }
        setMeetingId(finalMeetingId); // Update state with the new ID
      } else if (meetingIdToJoinParam) { // Callee joining via invite link
        finalMeetingId = meetingIdToJoinParam;
        // Meeting ID is already set from URL param
      }
      
      if (!finalMeetingId) {
          throw new Error("Meeting ID is required to join.");
      }
      
      // Now that meeting ID is finalized, call actualJoinMeeting
      await actualJoinMeeting(finalMeetingId); 

    } catch (error: any) {
      console.error('Failed to join meeting (handleJoinOrCreateMeeting):', error);
      setError(`Failed to join meeting: ${error.message}`);
      setCallStatus("Join Error");
      setIsJoining(false);
    }
  };

  const handleLeaveMeeting = (sdkInitiatedLeave = false) => {
    console.log(`[VideoSDK] handleLeaveMeeting called. SDK initiated: ${sdkInitiatedLeave}, IsConnected: ${isConnected}`);
    // SDK's meeting.leave() will trigger 'meeting-left' which also calls this.
    // This function is mainly for UI reset and app-specific cleanup.
    if (meetingRef.current && !sdkInitiatedLeave && isConnected) { // Only call leave if SDK didn't initiate it OR if we are cleaning up forcefully
      try {
        meetingRef.current.leave();
      } catch (e) {
        console.warn("[VideoSDK] Error during meetingRef.current.leave():", e);
      }
    }
    meetingRef.current = null; // Clear the ref

    // Stop and clear local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) { // Clear local preview
      localVideoRef.current.srcObject = null;
    }
    // Clear the VideoSDK container
    if (videoContainerRef.current) {
      videoContainerRef.current.innerHTML = ''; // VideoSDK might also clean this, but good to be sure
    }
    
    const wasConnected = isConnected;
    setIsConnected(false);
    setParticipants([]);
    setCallStatus("Disconnected");
    
    const currentChatId = chatIdParam || (isCaller ? chatIdParam : null); // Get current chat ID for context

    // Caller cleanup for invites
    if (isCaller && calleeIdParam && inviteSent && user && currentChatId) {
      console.log(`[VideoSDK] Caller leaving/cancelling. Invite to: ${calleeIdParam}`);
      // Attempt to delete the invite document
      deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
        .then(() => console.log(`[VideoSDK] Invite doc for ${calleeIdParam} deleted.`))
        .catch(e => console.warn("[VideoSDK] Error deleting invite on leave:", e));
      
      // Add missed call if the call wasn't connected by the callee or joining process was interrupted
      if (!wasConnected && !isJoining) { // If invite was sent but call never reached 'connected' state for the caller
          addMissedCallMessage(currentChatId, 'videosdk', user.uid, calleeIdParam);
      }
    }
    
    // Don't auto-navigate if SDK initiated the leave (e.g. meeting ended by host)
    // Or if it was just a cleanup from unmount.
    // Only navigate if user explicitly clicked leave or a critical error forced it.
    if (!sdkInitiatedLeave) { 
        // Using a small timeout to allow SDK cleanup to complete if it's also running
        setTimeout(() => {
          if (document.visibilityState === 'visible') { // Simple check if page is still active and user initiated the leave
            router.replace(currentChatId ? `/chats/${currentChatId}` : '/chats');
          }
        }, 300);
    } else {
        // SDK initiated leave (e.g., meeting ended by host, or SDK error), just reset state for potential new join
        setMeetingId('');
        setIsJoining(false);
        // setError(''); // Keep error if SDK reported one to show to user
        setInviteSent(false);
    }
  };

  // Cleanup effect for component unmount
  useEffect(() => {
    // This is the main cleanup effect for component unmount
    return () => {
        console.log("[VideoSDK] Component unmounting. Current state: isConnected:", isConnected, "isJoining:", isJoining, "inviteSent:", inviteSent);
        if (meetingRef.current && isConnected) { // If connected and meeting object exists
            console.log("[VideoSDK] Leaving meeting due to component unmount.");
            meetingRef.current.leave(); // Trigger VideoSDK's leave process
            meetingRef.current = null;
        }
        if (localStream) { // Stop any local media streams
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
        }
        if (videoContainerRef.current) { // Clear the SDK's video container
            videoContainerRef.current.innerHTML = '';
        }

        // Handle invite cleanup if caller unmounts before callee answers/joins
        // This logic ensures that if the caller navigates away or closes the tab while an invite is pending,
        // the invite is cleaned up and a missed call is logged for the callee.
        if (isCaller && calleeIdParam && inviteSent && user && chatIdParam && !isConnected && !isJoining) {
            console.log(`[VideoSDK] Caller unmounting, invite was sent to ${calleeIdParam} for chat ${chatIdParam}, but not connected/joining. Cleaning up invite.`);
            deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
                .then(() => console.log(`[VideoSDK] Invite doc for ${calleeIdParam} deleted due to unmount.`))
                .catch(e => console.warn("Error deleting invite on unmount:", e));
            addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaller, calleeIdParam, chatIdParam, inviteSent, user]); // Dependencies that define the "caller inviting" state


  const toggleCamera = async () => {
    const newCameraState = !isCameraOn;
    if (meetingRef.current && isConnected) { // If in an active meeting, use SDK methods
      if (newCameraState) meetingRef.current.unmuteWebcam();
      else meetingRef.current.disableWebcam();
    }
    setIsCameraOn(newCameraState); // Update local state for UI and pre-join preview
    if (!isConnected) { // Update preview if not in meeting
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = newCameraState);
        if (!newCameraState && localVideoRef.current) localVideoRef.current.srcObject = null; // Clear preview if turning off
        else if (newCameraState) await initializeLocalMedia(); // Re-init to get video track if it was off and no stream
      } else if (newCameraState) {
         await initializeLocalMedia(); // Ensure media is initialized if turning on and no stream exists
      }
    }
  };

  const toggleMicrophone = async () => {
    const newMicState = !isMicOn;
    if (meetingRef.current && isConnected) { // If in an active meeting, use SDK methods
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
    setIsMicOn(newMicState); // Update local state for UI and pre-join preview
    if (!isConnected) { // Update preview if not in meeting
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = newMicState);
        } else if (newMicState) { // If turning on mic and no stream, initialize media
            await initializeLocalMedia();
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
  
  if (!API_KEY_FROM_ENV) { // Critical check for API key from environment
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-semibold">Video SDK Configuration Error</p>
            <p className="text-sm text-red-400">API Key is not set in environment variables.</p>
        </div>
    );
  }

  // Initial loading state (SDK script, auth token)
  if ((!sdkLoaded && !error.includes("SDK")) || (!authToken && !error.includes("Token") && !error.includes("Configuration"))) {
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
          // Join Meeting Form
          <div className="flex items-center justify-center min-h-screen p-4">
            <Card className="bg-gray-800 border-gray-700 shadow-xl w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">
                  {meetingIdToJoinParam && callerNameParam ? `Call from ${callerNameParam}` : (isCaller && calleeIdParam && user ? `Invite User to Call` : "Video Call")}
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

                {/* Meeting ID Input: Shown if not a callee joining via link OR if a caller inviting */}
                {(!meetingIdToJoinParam || (isCaller && calleeIdParam)) && (
                    <div className="space-y-2">
                        <Label htmlFor="meetingId" className="text-sm font-medium text-gray-300">Meeting ID</Label>
                         <div className="flex gap-2">
                            <Input
                            id="meetingId"
                            type="text"
                            value={meetingId}
                            onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                            className="flex-1 bg-gray-700 border-gray-600 placeholder:text-gray-500 focus:ring-blue-500 focus:border-blue-500"
                            placeholder={isCaller ? "Auto-generate or Enter ID" : "Enter Meeting ID"}
                            disabled={!!meetingIdToJoinParam && !isCaller} // Disable if callee joining
                            />
                            <Button
                                onClick={() => setMeetingId(generateRandomMeetingId())}
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
                            {isCaller ? "Leave blank to create a new meeting when inviting." : (meetingIdToJoinParam ? `Joining: ${meetingIdToJoinParam}` : "Or leave blank to create a new one.")}
                         </p>
                    </div>
                )}
                 {/* Display Meeting ID if joining as callee */}
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
                  onClick={handleJoinOrCreateMeeting}
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
                            className="w-full h-full object-cover transform scale-x-[-1]" // Mirrored preview
                        />
                        {(!localStream || !isCameraOn) && ( // Show placeholder if no stream OR camera is off
                             <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center">
                                { !API_KEY_FROM_ENV ? <CameraOff className="h-10 w-10 text-red-400 mb-2" /> : // If API key error
                                  !localStream && !error.includes("Camera/microphone access failed") ? <Loader2 className="h-8 w-8 animate-spin text-gray-500" /> : // If loading stream
                                  (isCameraOn && error.includes("Camera/microphone access failed")) ? <CameraOff className="h-10 w-10 text-red-400 mb-2" /> : // If permission error
                                  !isCameraOn ? ( // If camera is toggled off
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
                    Copy ID
                </Button>
              </div>
               <div className="flex items-center gap-1.5 text-sm text-gray-300 bg-gray-700 px-2 py-1 rounded-md">
                  <Users size={16} />
                  <span>{participants.length + 1}</span> {/* +1 for local participant */}
                </div>
            </header>
            
            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-gray-900">
              {/* VideoSDK.live renders participant videos here */}
              <div id="video-sdk-container" ref={videoContainerRef} className="w-full h-full rounded-lg shadow-2xl border border-gray-700 bg-black">
                {/* This div is the container for VideoSDK */}
              </div>
              {isJoining && !isConnected && ( // Show loading overlay if joining but not yet connected by SDK
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
                  onClick={() => handleLeaveMeeting(false)} // User explicitly leaves
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

// Wrap the component content to use Suspense for useSearchParams
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

// pages/api/generate-token.ts - Re-verify it's correct
import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';

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