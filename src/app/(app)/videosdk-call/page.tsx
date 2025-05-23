
"use client";

import { useState, useEffect, useRef, type ReactNode, Suspense } from 'react';
import Head from 'next/head';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Users, Loader2, RefreshCw, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { addMissedCallMessage } from '@/lib/chatActions';

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
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const meetingRef = useRef<any>(null);
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const calleeIdParam = searchParams.get('calleeId');
  const chatIdParam = searchParams.get('chatId');
  const meetingIdToJoinParam = searchParams.get('meetingIdToJoin');
  const callerNameParam = searchParams.get('callerName');

  const [inviteSent, setInviteSent] = useState(false);
  const [isCaller, setIsCaller] = useState(false);

  const API_KEY = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;

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
    const script = document.createElement('script');
    script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
    script.async = true;
    
    const handleScriptLoad = () => {
      console.log('Video SDK script DOM onload event fired.');
      if (window.VideoSDK) {
        console.log('window.VideoSDK is available immediately on DOM onload.');
        setSdkLoaded(true);
      } else {
        console.warn('window.VideoSDK is NOT available immediately on DOM onload. SDK might do further async initialization. Checking again after a short delay...');
        setTimeout(() => {
            if (window.VideoSDK) {
                console.log('window.VideoSDK became available after a short delay.');
                setSdkLoaded(true);
            } else {
                console.error('window.VideoSDK still not available after delay. SDK loading failed or is very slow.');
                setError('Video SDK failed to initialize properly. Please try refreshing the page.');
                setSdkLoaded(false);
            }
        }, 1000); // Increased delay slightly
      }
    };

    script.onload = handleScriptLoad;
    script.onerror = () => {
        console.error('Failed to load Video SDK script from source.');
        setError('Failed to load Video SDK script. Please check your internet connection or ad-blocker, then try refreshing the page.');
        setSdkLoaded(false);
    }
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      if (meetingRef.current) {
        meetingRef.current.leave();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (isCaller && calleeIdParam && !isConnected && inviteSent && user) {
         deleteDoc(doc(db, "videoCallInvites", calleeIdParam)).catch(e => console.warn("Error deleting invite on unmount:", e));
         if (chatIdParam) {
           addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
         }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ensure this runs only once

  const generateToken = async (currentMeetingId: string) => {
    if (!API_KEY) {
        setError("Video SDK API Key is not configured. Please check setup.");
        throw new Error("Video SDK API Key is not configured.");
    }
    try {
      const response = await fetch('/api/generate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: API_KEY,
          meetingId: currentMeetingId || undefined, 
          permissions: ['allow_join', 'allow_mod']
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to generate token. Server error.' }));
        throw new Error(errorData.message || 'Failed to generate token');
      }
      const data = await response.json();
      return data.token;
    } catch (err: any) {
      console.error('Token generation error:', err);
      setError(`Token generation failed: ${err.message}`);
      throw err;
    }
  };

  // This function is primarily for the pre-join preview
  const initializeLocalMediaPreview = async () => {
    if (localStream) { 
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn, // Use state here for preview consistency
        audio: isMicOn    // Use state here for preview consistency
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err: any) {
      console.error('Error accessing media devices for preview:', err);
      setError('Failed to access camera/microphone for preview. Please check permissions.');
      setLocalStream(null);
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
      // Don't throw here, allow UI to show error
    }
  };

  useEffect(() => {
    if (!isConnected && sdkLoaded) { // Only initialize preview if SDK is loaded (or tried to load) and not in a call
        initializeLocalMediaPreview();
    }
    // Cleanup for the preview stream if component unmounts or isConnected changes
    return () => {
        if (localStream && !isConnected) { // If stream exists and we are not in a call (or leaving one)
            localStream.getTracks().forEach(track => track.stop());
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected]); // Re-run if camera/mic toggles for preview, or SDK status changes

  const handleInviteAndStartCall = async () => {
    if (!calleeIdParam || !chatIdParam || !user) {
        setError("Cannot invite: Callee or Chat information missing.");
        return;
    }
    if (!meetingId.trim() || !userName.trim()) {
      setError('Please enter Meeting ID and Your Name.');
      return;
    }
    if (!API_KEY) {
      setError("Video SDK API Key is missing. Please configure it.");
      return;
    }

    setIsJoining(true);
    setError('');
    try {
        const inviteRef = doc(db, "videoCallInvites", calleeIdParam);
        await setDoc(inviteRef, {
            callerId: user.uid,
            callerName: user.displayName || "A user",
            callerAvatar: user.photoURL || "",
            meetingId: meetingId.trim(),
            status: 'ringing',
            createdAt: serverTimestamp(),
            chatId: chatIdParam,
            callType: 'videosdk'
        });
        setInviteSent(true);
        toast({ title: "Calling...", description: `Inviting user to join meeting: ${meetingId.trim()}`});
        await actualJoinMeeting(meetingId.trim());
    } catch (e: any) {
        setError("Failed to send call invite: " + e.message);
        console.error("Failed to send invite: ", e);
        setIsJoining(false);
    }
  };
  
  const actualJoinMeeting = async (currentMeetingId: string) => {
     if (!currentMeetingId.trim() || !userName.trim()) {
      setError('Please enter Meeting ID and Your Name to join.');
      setIsJoining(false);
      return;
    }
    if (!API_KEY) {
        setError("Video SDK API Key is not configured. Cannot join meeting.");
        setIsJoining(false);
        return;
    }
    if (!sdkLoaded || !window.VideoSDK) {
      setError('Video SDK is not loaded yet. Please wait a moment or try refreshing the page.');
      setIsJoining(false);
      return;
    }

    setIsJoining(true); // Ensure this is set before async operations
    setError('');

    try {
      // Stop the preview stream if it's active, SDK will manage its own
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        if(localVideoRef.current) localVideoRef.current.srcObject = null;
      }

      const token = await generateToken(currentMeetingId);
      if (!token) {
        setIsJoining(false);
        return; 
      }

      const meeting = window.VideoSDK.initMeeting({
        meetingId: currentMeetingId,
        name: userName,
        apiKey: API_KEY,
        token: token, 
        containerId: 'video-container', 
        micEnabled: isMicOn,        // SDK will request mic based on this
        webcamEnabled: isCameraOn,  // SDK will request webcam based on this
        participantCanToggleSelfWebcam: true,
        participantCanToggleSelfMic: true,
        chatEnabled: true, 
        screenShareEnabled: true, 
      });

      meetingRef.current = meeting;

      meeting.on('meeting-joined', () => {
        console.log('VideoSDK Meeting joined successfully');
        setIsConnected(true);
        setParticipants([{ id: meeting.localParticipant.id, displayName: userName, isLocal: true }]);
        if (!isCaller && user) {
           updateDoc(doc(db, "videoCallInvites", user.uid), { status: 'answered', updatedAt: serverTimestamp() })
              .catch(e => console.error("Error updating invite to answered:", e));
        }
      });

      meeting.on('meeting-left', () => {
        console.log('VideoSDK Meeting left');
        setIsConnected(false);
        setParticipants([]);
        meetingRef.current = null; 
        if (isCaller && calleeIdParam && inviteSent && user) {
           deleteDoc(doc(db, "videoCallInvites", calleeIdParam)).catch(e => console.warn("Error deleting invite on leave:", e));
           // No missed call if caller just leaves after connecting. Add if call never connected.
        }
        initializeLocalMediaPreview(); // Re-initialize preview after leaving
      });

      meeting.on('participant-joined', (participant: any) => {
        console.log('VideoSDK Participant joined:', participant);
        setParticipants(prev => [...prev, {id: participant.id, displayName: participant.displayName}]);
      });

      meeting.on('participant-left', (participant: any) => {
        console.log('VideoSDK Participant left:', participant);
        setParticipants(prev => prev.filter(p => p.id !== participant.id));
      });
      
      meeting.on('error', (errorData: any) => {
        console.error('VideoSDK Meeting error:', errorData);
        setError(`Meeting error: ${errorData.name} - ${errorData.message || 'Unknown error'}`);
        setIsConnected(false); 
      });

      meeting.join();
    } catch (err: any) {
      console.error('Failed to join VideoSDK meeting:', err);
      setError(`Failed to join meeting: ${err.message || 'Please try again.'}`);
      initializeLocalMediaPreview(); // Restore preview on failure
    } finally {
      // setIsJoining should be set to false once meeting.join() completes or fails
      // For now, it's implicitly handled by isConnected state change.
      // If meeting.join() itself is async and doesn't immediately set state,
      // you might need more nuanced handling of isJoining.
      // For this SDK, meeting-joined or error events will ultimately change isConnected.
    }
  };

  const handleLeaveMeeting = () => {
    if (meetingRef.current) {
      meetingRef.current.leave(); 
    }
    // SDK's 'meeting-left' event will handle other cleanup like setIsConnected(false)
    // No need to manually stop localStream here, SDK's leave should handle its streams
    // And initializeLocalMediaPreview() will be called from 'meeting-left'
    toast({ title: "Meeting Ended", description: "You have left the meeting." });
    if (isCaller && calleeIdParam && inviteSent && !isConnected && user && chatIdParam) { // If caller leaves before callee connects fully
        addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
    }
    router.replace(chatIdParam ? `/chats/${chatIdParam}` : '/chats');
  };

  const toggleCamera = () => {
    const newCameraState = !isCameraOn;
    setIsCameraOn(newCameraState);
    if (meetingRef.current && isConnected) {
      if (newCameraState) meetingRef.current.enableWebcam();
      else meetingRef.current.disableWebcam();
    }
  };

  const toggleMicrophone = () => {
    const newMicState = !isMicOn;
    setIsMicOn(newMicState);
    if (meetingRef.current && isConnected) {
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
  };

  const generateRandomMeetingId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
      if (i === 2 || i === 5) result += '-';
    }
    setMeetingId(result);
  };
  
  const currentParticipantCount = isConnected ? (participants.filter(p => !p.isLocal).length + 1) : 0;

  if (authLoading) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p>Authenticating...</p>
        </div>
    );
  }
  if (!sdkLoaded && !error.startsWith('Failed to load Video SDK script')) { // Show specific loader for SDK script
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
            <p>Loading Video SDK...</p>
        </div>
    );
  }


  return (
    <>
      <Head>
        <title>Video Call - VideoSDK</title>
        <meta name="description" content="Video calling with VideoSDK" />
      </Head>

      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        {!isConnected ? (
          <div className="flex items-center justify-center flex-1 p-4">
            <Card className="bg-gray-800 border-gray-700 shadow-xl w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Video Call</CardTitle>
                <CardDescription className="text-gray-400">
                    {meetingIdToJoinParam ? `Joining call from ${callerNameParam || 'user'}` : 'Connect with VideoSDK'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded-md text-sm text-center">
                    {error}
                  </div>
                )}
                {!API_KEY && (
                   <div className="bg-yellow-500/20 border border-yellow-500 text-yellow-300 p-3 rounded-md text-sm text-center">
                    Video SDK API Key is not configured. Video calls may not work.
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="userName" className="text-sm font-medium text-gray-300">Your Name</Label>
                  <Input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="bg-gray-700 border-gray-600 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 text-white"
                    placeholder="Enter your name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meetingId" className="text-sm font-medium text-gray-300">Meeting ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="meetingId"
                      type="text"
                      value={meetingId}
                      onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                      className="flex-1 bg-gray-700 border-gray-600 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500 text-white"
                      placeholder={isCaller ? "Generate or Enter ID" : "Meeting ID from invite"}
                      disabled={!!meetingIdToJoinParam}
                    />
                    {!meetingIdToJoinParam && (
                        <Button
                        onClick={generateRandomMeetingId}
                        variant="outline"
                        className="bg-gray-600 hover:bg-gray-500 border-gray-500 text-gray-200"
                        size="icon"
                        aria-label="Generate Meeting ID"
                        >
                        <RefreshCw size={18} />
                        </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-start space-x-6 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="cameraOn" checked={isCameraOn} onCheckedChange={(checked) => setIsCameraOn(!!checked)} className="border-gray-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500" />
                    <Label htmlFor="cameraOn" className="text-sm text-gray-300">Camera On</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="micOn" checked={isMicOn} onCheckedChange={(checked) => setIsMicOn(!!checked)} className="border-gray-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500" />
                    <Label htmlFor="micOn" className="text-sm text-gray-300">Mic On</Label>
                  </div>
                </div>

                <Button
                  onClick={isCaller ? handleInviteAndStartCall : () => actualJoinMeeting(meetingId)}
                  disabled={isJoining || !sdkLoaded || !userName.trim() || !meetingId.trim() || !API_KEY}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-3"
                  size="lg"
                >
                  {isJoining ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isJoining ? 'Connecting...' : (isCaller ? `Invite & Start Call` : "Join Meeting")}
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
                        {!localStream && !error.includes("camera/microphone") && !error.includes("Video SDK failed to initialize") && ( 
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
                         {(error.includes("camera/microphone") || error.includes("Video SDK failed to initialize")) && ( 
                            <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center p-4">
                                <CameraOff className="h-10 w-10 text-red-400 mb-2" />
                                <p className="text-sm text-red-300">{error.includes("Video SDK failed to initialize") ? "Video SDK could not start. Check console." : error}</p>
                                <p className="text-xs text-gray-400 mt-1">Check browser permissions or refresh.</p>
                            </div>
                        )}
                    </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full flex flex-col">
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
               <div className="flex items-center gap-1.5 text-sm text-gray-400 bg-gray-700 px-2 py-1 rounded-md">
                  <Users size={16} />
                  <span>{currentParticipantCount}</span>
                </div>
            </header>

            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-gray-900">
              <div id="video-container" className="w-full h-full bg-black rounded-lg shadow-2xl border border-gray-700">
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
                  onClick={handleLeaveMeeting}
                  variant="destructive"
                  size="lg"
                  className="rounded-full p-3 aspect-square bg-red-600 hover:bg-red-700"
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
    <Suspense fallback={<div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4"><Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" /><p>Loading Video Call...</p></div>}>
      <VideoSDKCallPageContent />
    </Suspense>
  )
}


    