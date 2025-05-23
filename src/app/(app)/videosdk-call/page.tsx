
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
    if (!API_KEY) {
        setError("Video SDK API Key is not configured. Video calls are disabled.");
        setSdkLoaded(false); // Ensure SDK is marked as not loaded
        return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
    script.async = true;
    
    const handleScriptLoad = () => {
      console.log('Video SDK script DOM onload event fired.');
      if (window.VideoSDK) {
        console.log('window.VideoSDK is available immediately on DOM onload.');
        setSdkLoaded(true);
        setError(''); // Clear previous errors if any
      } else {
        console.warn('window.VideoSDK is NOT available immediately on DOM onload. Checking again after 2 seconds...');
        setTimeout(() => {
            if (window.VideoSDK) {
                console.log('window.VideoSDK became available after a 2-second delay.');
                setSdkLoaded(true);
                setError('');
            } else {
                console.error('window.VideoSDK still not available after 2-second delay. SDK loading failed or is very slow.');
                setError('Video SDK failed to initialize properly. Please try refreshing the page or check console for more details.');
                setSdkLoaded(false);
            }
        }, 2000); // Increased delay
      }
    };

    script.onload = handleScriptLoad;
    script.onerror = (event) => {
        console.error('Failed to load Video SDK script from source. Event:', event);
        setError('Failed to load Video SDK script. Please check your internet connection, ad-blocker, or browser console, then try refreshing the page.');
        setSdkLoaded(false);
    }
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      if (meetingRef.current) {
        meetingRef.current.leave();
        meetingRef.current = null;
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (isCaller && calleeIdParam && !isConnected && inviteSent && user && chatIdParam) {
         deleteDoc(doc(db, "videoCallInvites", calleeIdParam)).catch(e => console.warn("Error deleting invite on unmount:", e));
         addMissedCallMessage(chatIdParam, 'videosdk', user.uid, calleeIdParam);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // API_KEY is checked internally, script loading should only happen once.

  const generateToken = async (currentMeetingId: string) => {
    if (!API_KEY) {
        setError("Video SDK API Key is not configured.");
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

  const initializeLocalMediaPreview = async () => {
    if (localStream) { 
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isCameraOn,
        audio: isMicOn
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error('Error accessing media devices for preview:', err);
      setError('Failed to access camera/microphone for preview. Please check permissions.');
      setLocalStream(null);
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isConnected && sdkLoaded) {
        initializeLocalMediaPreview();
    }
    return () => {
        if (localStream && !isConnected) { 
            localStream.getTracks().forEach(track => track.stop());
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected]);

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
      setError('Video SDK is not loaded yet. Please wait or check your connection.');
      setIsJoining(false);
      return;
    }

    setIsJoining(true);
    setError('');

    try {
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
        micEnabled: isMicOn,
        webcamEnabled: isCameraOn,
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
        if (isCaller && calleeIdParam && inviteSent && user && chatIdParam) {
           deleteDoc(doc(db, "videoCallInvites", calleeIdParam)).catch(e => console.warn("Error deleting invite on leave:", e));
        }
        initializeLocalMediaPreview();
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
      if (!isConnected) initializeLocalMediaPreview(); // Restore preview only if not connected
    } finally {
      // isJoining will be set to false by isConnected state change via meeting-joined or error events
    }
  };

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
    if (!sdkLoaded) {
      setError("Video SDK is not ready yet. Please wait.");
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

  const handleLeaveMeeting = () => {
    if (meetingRef.current) {
      meetingRef.current.leave(); 
    }
    toast({ title: "Meeting Ended", description: "You have left the meeting." });
    if (isCaller && calleeIdParam && inviteSent && !isConnected && user && chatIdParam) {
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p>Authenticating...</p>
        </div>
    );
  }
  if (!sdkLoaded && !error.includes('Failed to load Video SDK script') && !error.includes('Video SDK API Key is not configured')) { 
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
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

      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {!isConnected ? (
          <div className="flex items-center justify-center flex-1 p-4">
            <Card className="bg-card border-border shadow-xl w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Video Call</CardTitle>
                <CardDescription className="text-muted-foreground">
                    {meetingIdToJoinParam ? `Joining call from ${callerNameParam || 'user'}` : 'Connect with VideoSDK'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="bg-destructive/10 border border-destructive text-destructive p-3 rounded-md text-sm text-center">
                    {error}
                  </div>
                )}
                {!API_KEY && ( /* This check is also done in useEffect, but good for UI */
                   <div className="bg-destructive/10 border border-destructive text-destructive p-3 rounded-md text-sm text-center">
                    Video SDK API Key is not configured. Video calls are disabled.
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="userName" className="text-sm font-medium text-foreground">Your Name</Label>
                  <Input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="bg-input border-border placeholder:text-muted-foreground focus:ring-primary focus:border-primary"
                    placeholder="Enter your name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meetingId" className="text-sm font-medium text-foreground">Meeting ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="meetingId"
                      type="text"
                      value={meetingId}
                      onChange={(e) => setMeetingId(e.target.value.toUpperCase())}
                      className="flex-1 bg-input border-border placeholder:text-muted-foreground focus:ring-primary focus:border-primary"
                      placeholder={isCaller ? "Generate or Enter ID" : "Meeting ID from invite"}
                      disabled={!!meetingIdToJoinParam}
                    />
                    {!meetingIdToJoinParam && (
                        <Button
                        onClick={generateRandomMeetingId}
                        variant="outline"
                        className="bg-secondary hover:bg-muted border-border text-secondary-foreground"
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
                    <Checkbox id="cameraOn" checked={isCameraOn} onCheckedChange={(checked) => setIsCameraOn(!!checked)} className="border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    <Label htmlFor="cameraOn" className="text-sm text-foreground">Camera On</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="micOn" checked={isMicOn} onCheckedChange={(checked) => setIsMicOn(!!checked)} className="border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                    <Label htmlFor="micOn" className="text-sm text-foreground">Mic On</Label>
                  </div>
                </div>

                <Button
                  onClick={isCaller ? handleInviteAndStartCall : () => actualJoinMeeting(meetingId)}
                  disabled={isJoining || !sdkLoaded || !userName.trim() || !meetingId.trim() || !API_KEY}
                  className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-primary-foreground font-medium py-3"
                  size="lg"
                >
                  {isJoining ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isJoining ? 'Connecting...' : (isCaller ? `Invite & Start Call` : "Join Meeting")}
                </Button>
                
                <div className="mt-4">
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 text-center">Camera Preview</h3>
                    <div className="relative bg-black rounded-md overflow-hidden aspect-video border border-border">
                        <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover transform scale-x-[-1]" 
                        />
                        {!localStream && !error.includes("camera/microphone") && !error.includes("Video SDK failed to initialize") && !error.includes("API Key") && ( 
                             <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        )}
                        {localStream && !isCameraOn && (
                            <div className="absolute inset-0 bg-card/90 flex flex-col items-center justify-center text-center">
                                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-border">
                                <span className="text-2xl font-bold text-muted-foreground">
                                    {userName.charAt(0).toUpperCase() || '?'}
                                </span>
                                </div>
                                <p className="text-sm text-muted-foreground">Camera is off</p>
                            </div>
                        )}
                         {(error.includes("camera/microphone") || error.includes("Video SDK failed to initialize") || error.includes("API Key")) && ( 
                            <div className="absolute inset-0 bg-card/90 flex flex-col items-center justify-center text-center p-4">
                                <CameraOff className="h-10 w-10 text-destructive mb-2" />
                                <p className="text-sm text-destructive">{error}</p>
                                <p className="text-xs text-muted-foreground mt-1">Check browser permissions or refresh.</p>
                            </div>
                        )}
                    </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <header className="bg-card p-3 flex justify-between items-center border-b border-border">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">Meeting ID: {meetingId}</h1>
                <Button variant="ghost" size="sm" onClick={() => {
                    navigator.clipboard.writeText(meetingId);
                    toast({title: "Meeting ID Copied!", description: meetingId});
                    }}
                    className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground px-2"
                >
                    <Copy size={14} className="mr-1.5"/> Copy ID
                </Button>
              </div>
               <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                  <Users size={16} />
                  <span>{currentParticipantCount}</span>
                </div>
            </header>

            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-background">
              <div id="video-container" className="w-full h-full bg-black rounded-lg shadow-2xl border border-border">
              </div>
            </main>

            <footer className="bg-card p-3 border-t border-border">
              <div className="flex justify-center items-center space-x-3 md:space-x-4">
                <Button
                  onClick={toggleMicrophone}
                  variant="outline"
                  size="lg"
                  className={`rounded-full p-3 aspect-square ${
                    isMicOn ? 'bg-secondary hover:bg-muted border-border' : 'bg-destructive hover:bg-destructive/90 border-destructive'
                  } text-foreground`}
                  aria-label={isMicOn ? "Mute microphone" : "Unmute microphone"}
                >
                  {isMicOn ? <Mic className="h-5 w-5 md:h-6 md:w-6" /> : <MicOff className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>

                <Button
                  onClick={toggleCamera}
                  variant="outline"
                  size="lg"
                  className={`rounded-full p-3 aspect-square ${
                    isCameraOn ? 'bg-secondary hover:bg-muted border-border' : 'bg-destructive hover:bg-destructive/90 border-destructive'
                  } text-foreground`}
                  aria-label={isCameraOn ? "Turn video off" : "Turn video on"}
                >
                  {isCameraOn ? <Camera className="h-5 w-5 md:h-6 md:w-6" /> : <CameraOff className="h-5 w-5 md:h-6 md:w-6" />}
                </Button>
                
                <Button
                  onClick={handleLeaveMeeting}
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
    <Suspense fallback={<div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4"><Loader2 className="h-12 w-12 animate-spin text-primary mb-4" /><p>Loading Video Call...</p></div>}>
      <VideoSDKCallPageContent />
    </Suspense>
  )
}
