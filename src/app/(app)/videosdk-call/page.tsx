
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
  const callerNameParam = searchParams.get('callerName');

  const [isCaller, setIsCaller] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  
  const API_KEY_FROM_ENV = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;

  useEffect(() => {
    if (!API_KEY_FROM_ENV) {
        setError("Video SDK API Key is not configured. Video calls are disabled.");
        setCallStatus("Configuration Error");
        setSdkLoaded(false); // Ensure SDK is marked as not loaded if key is missing
        return;
    }
    setCallStatus("Generating token...");
    generateAuthToken();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_KEY_FROM_ENV]); // Only re-run if API_KEY_FROM_ENV changes (which it shouldn't at runtime)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, meetingIdToJoinParam, calleeIdParam]);


  useEffect(() => {
    if (!API_KEY_FROM_ENV) { // Guard against running if API key isn't set
        return; 
    }

    const scriptId = 'videosdk-script';
    // Check if script is already loaded and if VideoSDK object is available
    if (document.getElementById(scriptId)) {
      if (window.VideoSDK) {
        console.log('Video SDK script already loaded and available.');
        setSdkLoaded(true);
        setCallStatus(prev => prev === "Initializing..." || prev === "SDK Loading..." ? "SDK Loaded" : prev);
      } else {
        // Script tag found, but window.VideoSDK not ready. This might happen if the script is still executing.
        // The onload handler should eventually set it.
        console.warn('Video SDK script tag found, but window.VideoSDK not ready. Waiting for onload.');
      }
      return; // Don't append script again if tag exists
    }
    
    setCallStatus("SDK Loading...");
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
    script.async = true;
    script.crossOrigin = 'anonymous'; // Recommended for external scripts

    const handleScriptLoad = () => {
      console.log('Video SDK script loaded event fired.');
      if (window.VideoSDK) {
        console.log('window.VideoSDK is available.');
        setSdkLoaded(true);
        setCallStatus(prev => prev === "SDK Loading..." ? "SDK Loaded" : prev);
      } else {
        console.warn('window.VideoSDK not available immediately after onload. Retrying check...');
        // Some SDKs might take a fraction longer to initialize their global object
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
        }, 2000); // Increased timeout to 2 seconds
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
    
    document.head.appendChild(script); // Append to head for cleaner DOM

    return () => {
      // Cleanup function: remove script if component unmounts before load, or if desired
      // For prebuilt SDKs that attach to specific container IDs, direct script removal might not be needed
      // if the container itself is cleaned up. However, for hygiene:
      const loadedScript = document.getElementById(scriptId);
      if (loadedScript && loadedScript.parentNode) {
        // loadedScript.parentNode.removeChild(loadedScript); // Optional: if you want to remove script tag on unmount
      }
      // Ensure meeting is left if active
      if (meetingRef.current && isConnected) {
        console.log("[VideoSDK] Leaving meeting due to component unmount (from script load effect)");
        meetingRef.current.leave();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [API_KEY_FROM_ENV]); // Re-run if API_KEY_FROM_ENV changes (should be rare)


  const generateAuthToken = async () => {
    if (!API_KEY_FROM_ENV) { // Check if API_KEY_FROM_ENV is actually available
        setError("Video SDK API Key is not configured. Cannot generate token.");
        setCallStatus("Configuration Error");
        setAuthToken(''); // Ensure authToken is cleared
        return;
    }
    try {
      setCallStatus("Fetching token from API...");
      const response = await fetch('/api/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: API_KEY_FROM_ENV, // Use the key from env
          permissions: ['allow_join', 'allow_mod'],
          meetingId: meetingId || undefined // Pass meetingId if available
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAuthToken(data.token);
        setError(''); // Clear previous errors
        setCallStatus(prev => prev.includes("Token") || prev === "SDK Loaded" ? "Token Ready" : prev);
        return; // Success
      }
      
      // Handle API error response more gracefully
      let detailedErrorMessage = `API route token generation failed with status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          detailedErrorMessage += `. Server: "${errorData.message}"`;
        }
      } catch (parseError) {
        // If response is not JSON or empty
        detailedErrorMessage += `. ${response.statusText || 'Could not retrieve error details from server.'}`;
      }
      console.error(detailedErrorMessage);
      throw new Error(detailedErrorMessage);

    } catch (error: any) {
      console.error('Token generation via API route failed:', error);
      // Only attempt client-side fallback if API route failed and it's not a server config error
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
        // If it was a server config error from the API, or some other critical failure
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
    // This is NOT a secure JWT. In a real app, this should NEVER be done client-side.
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
        // body: JSON.stringify({ region: "sg001" }) // Optional: specify region
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})); // Try to parse error, default to empty if fail
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
      // Fallback to generating a random ID client-side if API fails
      return generateRandomMeetingId();
    }
  };

  const generateRandomMeetingId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) { // Increased length for more uniqueness
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const initializeLocalMedia = async () => {
    // Stop existing tracks if any
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // Only attempt to get media if camera or mic is intended to be on
    if (!isCameraOn && !isMicOn && !isConnected) { // Don't re-init if already connected and just toggling
        setCallStatus("Media devices off");
        return null; // No need to get stream if both are off
    }
    
    setCallStatus("Accessing media...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } : false,
        audio: isMicOn ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false
      });
      
      setLocalStream(stream);
      if (localVideoRef.current && stream) { // Check stream again
        localVideoRef.current.srcObject = stream;
      }
      setCallStatus("Media ready");
      return stream;
    } catch (error: any) {
      console.error('Error accessing media devices for preview:', error);
      setError(`Camera/microphone access failed: ${error.message}. Please check browser permissions.`);
      setCallStatus("Media Error");
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
      throw error; // Re-throw to be caught by handleJoinMeeting
    }
  };

  // Initialize local media for preview when component mounts or camera/mic toggles change (if not connected)
  useEffect(() => {
    if (!isConnected && sdkLoaded && API_KEY_FROM_ENV && !authLoading) { // Check sdkLoaded, API_KEY_FROM_ENV, and authLoading
        initializeLocalMedia().catch(e => console.warn("Initial media preview failed, user might need to grant permissions."));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected, API_KEY_FROM_ENV, authLoading]); // Dependencies for preview refresh

  
  // This is the main function to join or create and then join the meeting
  const actualJoinMeeting = async (currentMeetingId: string) => {
    if (!sdkLoaded || !window.VideoSDK) {
      setError('Video SDK is not loaded yet. Please wait or check your connection.');
      setIsJoining(false); // Reset joining state
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

    // Ensure local media is stopped before VideoSDK takes over, to avoid conflicts
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        if(localVideoRef.current) localVideoRef.current.srcObject = null;
    }
    setCallStatus("Joining meeting...");

    const config = {
      name: userName,
      meetingId: currentMeetingId,
      apiKey: API_KEY_FROM_ENV, // Use API_KEY from env
      token: authToken, // Pass the generated token

      containerId: 'video-sdk-container', // Make sure this div exists
      redirectOnLeave: false, // Set to true if you want to redirect to a URL after leaving
      
      micEnabled: isMicOn,
      webcamEnabled: isCameraOn,
      
      participantCanToggleSelfWebcam: true,
      participantCanToggleSelfMic: true,
      
      chatEnabled: true,
      screenShareEnabled: true,
      pollEnabled: false, // Example: disable polls
      whiteboardEnabled: false, // Example: disable whiteboard
      
      raiseHandEnabled: true,
      
      recordingEnabled: false, // Recording needs backend setup and plan changes
      // autoStartRecording: false,
      participantCanToggleRecording: false,
      // recordingWebhookUrl: "YOUR_WEBHOOK_URL",
      // recordingAWSDirPath: "/videosdk-recordings/", // Example path
      
      brandingEnabled: false,
      // brandLogoURL: "URL_OF_YOUR_LOGO",
      // brandName: "YOUR_BRAND_NAME",
      poweredBy: false, // Hides "Powered by VideoSDK"
      
      participantCanLeave: true, // If false, participants cannot leave
      
      // liveStream: {
      //   autoStart: true,
      //   outputs: [
      //     // {
      //     //   url: "rtmp://x.rtmp.youtube.com/live2",
      //     //   streamKey: "STREAM_KEY",
      //     // },
      //   ],
      // },
      
      maxResolution: 'hd', // 'sd' or 'hd'
      
      debug: process.env.NODE_ENV === 'development', // Enable debug logs in dev
      
      theme: 'DARK', // DARK, LIGHT, DEFAULT
      
      mode: 'CONFERENCE', // CONFERENCE, GROUP
      
      multiStream: true, //true For  GroupMeeting and false For OneToOneMeeting
      
      // Layout configuration
      layout: {
        type: 'SPOTLIGHT', // SPOTLIGHT, SIDEBAR, GRID, ADAPTIVE
        priority: 'SPEAKER', // PIN, SPEAKER
        gridSize: 4, // Max number of participants in grid
      },
      
      // Join screen configuration (VideoSDK's own join screen)
      joinScreen: {
        visible: true, // Show VideoSDK's join screen
        title: 'Video Call',
        meetingUrl: typeof window !== "undefined" ? window.location.href : "", // Used for copy-to-clipboard
      },
      
      // Permissions
      permissions: {
        askToJoin: false, // Participants don't need to ask to join
        toggleParticipantMic: true, // Allow host to mute/unmute participants
        toggleParticipantWebcam: true, // Allow host to enable/disable participant webcams
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
              // If this user is the callee who just answered an invite
              if (!isCaller && user && meetingIdToJoinParam && chatIdParam) { // Ensure meetingIdToJoinParam is the one used
                  try {
                      const inviteDocRef = doc(db, "videoCallInvites", user.uid);
                      const inviteSnap = await getDoc(inviteDocRef);
                      if(inviteSnap.exists() && inviteSnap.data()?.meetingId === currentMeetingId) { // Check if invite matches current meeting
                         await updateDoc(inviteDocRef, { status: 'answered', updatedAt: serverTimestamp() });
                         console.log(`[VideoSDK] Invite for ${user.uid} updated to answered.`);
                      }
                  } catch (e) {
                      console.error("[VideoSDK] Error updating invite to answered:", e);
                  }
              }
          },
          'meeting-left': () => {
              console.log('[VideoSDK] Meeting left callback triggered');
              handleLeaveMeeting(true); // Pass true to indicate SDK initiated the leave
          },
           'error': (err: any) => { // Type the error for better intellisense
              console.error('[VideoSDK] Meeting error:', err);
              setError(`Meeting error: ${err.name || 'Unknown'} - ${err.message || 'An error occurred'}`);
              setCallStatus("Meeting Error");
              setIsJoining(false);
              setIsConnected(false); // Ensure connected state is false on error
          },
          'participant-joined': (participant: any) => {
            console.log('[VideoSDK] Participant joined:', participant);
            setParticipants(prev => [...prev, participant]);
          },
          'participant-left': (participant: any) => {
            console.log('[VideoSDK] Participant left:', participant);
            setParticipants(prev => prev.filter(p => p.id !== participant.id));
          },
          // Add more callbacks as needed, e.g., for stream changes, chat messages, etc.
      }
    };

    try {
      // Ensure the container exists. VideoSDK prebuilt UI mounts here.
      if (!document.getElementById(config.containerId) && videoContainerRef.current) {
        const container = document.createElement('div');
        container.id = config.containerId;
        container.className = "w-full h-full"; // Ensure it takes space
        videoContainerRef.current.innerHTML = ''; // Clear previous content
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
      // The 'meeting-joined' callback will handle setIsConnected, setIsJoining etc.
    } catch (initError: any) {
      console.error('[VideoSDK] Error initializing meeting with window.VideoSDK.initMeeting:', initError);
      setError(`Meeting initialization failed: ${initError.message}`);
      setCallStatus("Initialization Error");
      setIsJoining(false); // Reset joining state
    }
  };

  // This function is called by the "Join Meeting" or "Invite & Start" button
  const handleJoinOrCreateMeeting = async () => {
    if (!userName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!API_KEY_FROM_ENV) { // Check API_KEY_FROM_ENV
        setError("Video SDK API Key is not configured. Cannot proceed.");
        setCallStatus("Configuration Error");
        return;
    }
    if (!authToken) {
      setError('Authentication token not ready. Please wait and try again.');
      setCallStatus("Token Error");
      // Attempt to regenerate token if missing and API key is present
      if (!API_KEY_FROM_ENV) { 
        setError("Video SDK API Key is not configured. Cannot generate token.");
      } else {
        await generateAuthToken(); // Re-attempt token generation
      }
      return;
    }

    setIsJoining(true);
    setError('');
    setCallStatus("Preparing to join...");

    try {
      let finalMeetingId = meetingId.trim();
      
      // If this user is the caller initiating an invite
      if (isCaller && calleeIdParam && chatIdParam && user) {
        if (!finalMeetingId) { // If caller didn't enter an ID, create one
            finalMeetingId = await createMeetingViaApi();
            if (!finalMeetingId) throw new Error("Failed to obtain a meeting ID for inviting.");
            setMeetingId(finalMeetingId); // Update state with the new meeting ID
        }
        // Create and send invite
        setCallStatus("Sending invite...");
        console.log(`[VideoSDK] Caller flow: Inviting ${calleeIdParam} to meeting ${finalMeetingId} for chat ${chatIdParam}`);
        const inviteRef = doc(db, "videoCallInvites", calleeIdParam);
        
        // Check if an invite already exists and is ringing, to avoid multiple ringing invites
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists() && inviteSnap.data()?.status === 'ringing') {
            // This is a design decision: either overwrite, or prevent, or notify user.
            // For now, let's log a warning. In a real app, you might disallow this or prompt.
            console.warn(`[VideoSDK] An existing ringing invite found for ${calleeIdParam}. Overwriting. Consider UX implications.`);
        }
        
        await setDoc(inviteRef, {
            callerId: user.uid,
            callerName: user.displayName || "A user",
            callerAvatar: user.photoURL || "", // Ensure a fallback or default avatar
            meetingId: finalMeetingId,
            status: 'ringing',
            createdAt: serverTimestamp(),
            chatId: chatIdParam,
            callType: 'videosdk' // Mark type for IncomingCallContext
        });
        setInviteSent(true); // Track that invite was sent for cleanup logic
        toast({ title: "Calling...", description: `Inviting user to join meeting: ${finalMeetingId}`});
      } else if (!finalMeetingId && !meetingIdToJoinParam) { // Not an invite, and no ID provided, create new
        finalMeetingId = await createMeetingViaApi();
        if (!finalMeetingId) {
            // createMeetingViaApi should handle its own errors and fallback if needed
            // but if it still returns null/undefined, something is wrong.
            throw new Error("Failed to obtain a meeting ID.");
        }
        setMeetingId(finalMeetingId); // Update state
      } else if (meetingIdToJoinParam) { // Joining via an invite link/param
        finalMeetingId = meetingIdToJoinParam;
      }
      
      // Ensure we have a meeting ID to proceed
      if (!finalMeetingId) {
          throw new Error("Meeting ID is required to join.");
      }
      
      await actualJoinMeeting(finalMeetingId); // Now actually join the meeting with VideoSDK

    } catch (error: any) {
      console.error('Failed to join meeting (handleJoinOrCreateMeeting):', error);
      setError(`Failed to join meeting: ${error.message}`);
      setCallStatus("Join Error");
      setIsJoining(false);
    }
  };


  const handleLeaveMeeting = (sdkInitiatedLeave = false) => {
    console.log(`[VideoSDK] handleLeaveMeeting called. SDK initiated: ${sdkInitiatedLeave}, IsConnected: ${isConnected}`);
    // Use meetingRef.current.leave() if SDK initiated it, it might already be in process of leaving
    if (meetingRef.current && !sdkInitiatedLeave && isConnected) { // Only call leave if user initiated and connected
      try {
        meetingRef.current.leave();
      } catch (e) {
        console.warn("[VideoSDK] Error during meetingRef.current.leave():", e);
        // Proceed with cleanup even if .leave() throws, as it might be state-related
      }
    }
    meetingRef.current = null; // Always nullify ref

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) { // Clear preview
      localVideoRef.current.srcObject = null;
    }
    if (videoContainerRef.current) { // Clear VideoSDK container
      videoContainerRef.current.innerHTML = '';
    }
    
    const wasConnected = isConnected; // Store previous connected state
    setIsConnected(false);
    setParticipants([]);
    setCallStatus("Disconnected");
    
    // Logic for caller cleaning up invite if they leave before callee answers
    const currentChatId = chatIdParam || (isCaller ? chatIdParam : null); // Get chatId from appropriate source

    if (isCaller && calleeIdParam && inviteSent && user && currentChatId) {
      console.log(`[VideoSDK] Caller leaving/cancelling. Invite was sent to: ${calleeIdParam}`);
      // Delete invite document if it exists
      deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
        .then(() => console.log(`[VideoSDK] Invite doc for ${calleeIdParam} deleted.`))
        .catch(e => console.warn("[VideoSDK] Error deleting invite on leave:", e));
      
      // Add missed call message ONLY if the call wasn't connected and not currently trying to join
      if (!wasConnected && !isJoining) { // wasConnected checks if they were *ever* connected in this session
          addMissedCallMessage(currentChatId, 'videosdk', user.uid, calleeIdParam);
      }
    }
    
    // If this was not an SDK-initiated leave (e.g., user clicked "Leave Meeting" button),
    // then navigate away. If SDK initiated (e.g., meeting ended by host), just reset state.
    if (!sdkInitiatedLeave) { 
        // Delay navigation slightly to allow SDK and Firestore cleanup to attempt completion
        setTimeout(() => {
          if (document.visibilityState === 'visible') { // Only navigate if tab is active
            router.replace(currentChatId ? `/chats/${currentChatId}` : '/chats');
          }
        }, 300); // Small delay
    } else {
        // Reset state if SDK ended the call, so user can potentially join/create another
        setMeetingId('');
        setIsJoining(false);
        setInviteSent(false);
        // Don't auto-navigate here, let user decide next action from the join screen
    }
  };

  // Effect for unmount cleanup
  useEffect(() => {
    // This is the cleanup function that runs when the component unmounts
    return () => {
        console.log("[VideoSDK] Component unmounting. Current state: isConnected:", isConnected, "isJoining:", isJoining, "inviteSent:", inviteSent);
        // Attempt to leave meeting if connected
        if (meetingRef.current && isConnected) {
            console.log("[VideoSDK] Leaving meeting due to component unmount.");
            try {
                meetingRef.current.leave();
            } catch(e) { console.warn("Error during meeting.leave() on unmount:", e); }
            meetingRef.current = null;
        }
        // Stop local media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null); // Clear state
        }
        // Clear video elements
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (videoContainerRef.current) videoContainerRef.current.innerHTML = '';

        // If the user was a caller, an invite was sent, but they were never connected (or were joining)
        // and the component is unmounting (e.g. they navigated away), clean up the invite.
        if (isCaller && calleeIdParam && inviteSent && user && chatIdParam && !isConnected && !isJoining) {
            console.log(`[VideoSDK] Caller unmounting, invite was sent to ${calleeIdParam} for chat ${chatIdParam}, but not connected/joining. Cleaning up invite.`);
            deleteDoc(doc(db, "videoCallInvites", calleeIdParam))
                .then(() => console.log(`[VideoSDK] Invite doc for ${calleeIdParam} deleted due to unmount.`))
                .catch(e => console.warn("Error deleting invite on unmount:", e));
            // Add missed call message because the callee never got to answer this specific attempt
            addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaller, calleeIdParam, chatIdParam, inviteSent, user]); // Add all relevant dependencies for unmount cleanup logic


  const toggleCamera = async () => {
    const newCameraState = !isCameraOn;
    if (meetingRef.current && isConnected) { // Control via SDK if connected
      if (newCameraState) meetingRef.current.unmuteWebcam();
      else meetingRef.current.disableWebcam();
    }
    setIsCameraOn(newCameraState); // Update local state for UI and preview

    // If not connected, update local preview stream
    if (!isConnected) {
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.enabled = newCameraState);
        // If turning off camera completely and no mic, might stop stream
        if (!newCameraState && !isMicOn && localVideoRef.current) localVideoRef.current.srcObject = null; // Clear preview if both off
        else if (newCameraState) await initializeLocalMedia(); // Re-init if turning on and stream was stopped/null
      } else if (newCameraState) {
         await initializeLocalMedia(); // Initialize if no stream and turning on
      }
    }
  };

  const toggleMicrophone = async () => {
    const newMicState = !isMicOn;
    if (meetingRef.current && isConnected) { // Control via SDK if connected
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
    setIsMicOn(newMicState); // Update local state for UI and preview

    // If not connected, update local preview stream
    if (!isConnected) {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = newMicState);
        } else if (newMicState) {
            await initializeLocalMedia(); // Initialize if no stream and turning on mic
        }
    }
  };

  // UI Rendering
  if (authLoading) { // Show loading state while auth is being checked
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p>Authenticating User...</p>
            {error && <p className="text-red-400 mt-2">{error}</p>}
        </div>
    );
  }
  
  if (!API_KEY_FROM_ENV) { // Critical configuration error
     return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
            <p className="text-lg font-semibold">Video SDK Configuration Error</p>
            <p className="text-sm text-red-400">API Key is not set in environment variables.</p>
        </div>
    );
  }

  // Initial loading screen for SDK and Token
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

                {/* Conditional Meeting ID Input based on flow */}
                {(!meetingIdToJoinParam || (isCaller && calleeIdParam)) && ( // Show input if creating new or caller inviting
                    <div className="space-y-2">
                        <Label htmlFor="meetingId" className="text-sm font-medium text-gray-300">Meeting ID</Label>
                         <div className="flex gap-2">
                            <Input
                            id="meetingId"
                            type="text"
                            value={meetingId}
                            onChange={(e) => setMeetingId(e.target.value.toUpperCase())} // Ensure uppercase
                            className="flex-1 bg-gray-700 border-gray-600 placeholder:text-gray-500 focus:ring-blue-500 focus:border-blue-500"
                            placeholder={isCaller ? "Auto-generate or Enter ID" : "Enter Meeting ID"}
                            disabled={!!meetingIdToJoinParam && !isCaller} // Disable if callee joining with a specific ID
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
                {meetingIdToJoinParam && !isCaller && ( // Display for callee joining
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
                
                {/* Local video preview */}
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
                        {(!localStream || !isCameraOn) && ( // Show placeholder if no stream or camera is off
                             <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center">
                                { !API_KEY_FROM_ENV ? <CameraOff className="h-10 w-10 text-red-400 mb-2" /> : // API Key error
                                  !localStream && !error.includes("Camera/microphone access failed") ? <Loader2 className="h-8 w-8 animate-spin text-gray-500" /> : // Loading media
                                  (isCameraOn && error.includes("Camera/microphone access failed")) ? <CameraOff className="h-10 w-10 text-red-400 mb-2" /> : // Media access failed
                                  !isCameraOn ? ( // Camera explicitly off
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
                {/* Debug info */}
                <div className="mt-4 text-xs text-gray-500 text-center">
                    <div>Auth Token: {authToken ? '✓ Ready' : (API_KEY_FROM_ENV ? '⏳ Loading...' : '✗ Not Configured')}</div>
                    {/* <div>Meeting ID: {meetingId || 'Will be generated'}</div> */}
                    {/* <div>SDK Status: {sdkLoaded ? '✓ Loaded' : '⏳ Loading...'}</div> */}
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Video Call Interface
          <div className="h-screen flex flex-col">
            {/* Header */}
            <div className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">Meeting ID: {meetingId}</h1>
                {/* Optional: Copy Meeting ID Button */}
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
                  <span>{participants.length + 1}</span> {/* +1 for self */}
                </div>
            </header>
            
            {/* Video Container - This is where VideoSDK will render */}
            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-gray-900">
              <div 
                id="video-sdk-container" 
                ref={videoContainerRef}
                className="w-full h-full rounded-lg shadow-2xl border border-gray-700 bg-black" // Ensure bg-black for contrast
              >
                {/* VideoSDK prebuilt UI will mount here */}
              </div>
              {/* Loading/Joining overlay for when SDK is mounting */}
              {isJoining && !isConnected && (
                <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
                  <div className="text-center">
                    <Loader2 className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                    <p className="text-white">Connecting to meeting...</p>
                  </div>
                </div>
              )}
            </main>

            {/* Controls Footer */}
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
                  onClick={() => handleLeaveMeeting(false)} // User initiated leave
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

// Wrapper component for Suspense
const VideoSDKCallPage = () => {
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

export default VideoSDKCallPage;
