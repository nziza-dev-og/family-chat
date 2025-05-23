"use client";

import { useState, useEffect, useRef, type ReactNode } from 'react';
import Head from 'next/head';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Users, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

// Define the VideoSDK type globally for window
declare global {
  interface Window {
    VideoSDK: any;
  }
}

const VideoSDKCallPage = () => {
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

  const API_KEY = process.env.NEXT_PUBLIC_VIDEOSDK_API_KEY;

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://sdk.videosdk.live/rtc-js-prebuilt/0.3.26/rtc-js-prebuilt.js';
    script.async = true;
    script.onload = () => {
      console.log('Video SDK script loaded');
      setSdkLoaded(true);
    };
    script.onerror = () => {
        console.error('Failed to load Video SDK script');
        setError('Failed to load Video SDK. Please check your internet connection or try again later.');
    }
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      // Ensure meeting is left on component unmount
      if (meetingRef.current) {
        meetingRef.current.leave();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const generateToken = async () => {
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
          meetingId: meetingId || undefined, // Send meetingId only if it exists
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
      throw err; // Re-throw to be caught by handleJoinMeeting
    }
  };

  const initializeLocalMedia = async () => {
    if (localStream) { // If stream already exists, stop old tracks
        localStream.getTracks().forEach(track => track.stop());
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
      return stream;
    } catch (err: any) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone. Please check permissions.');
      setLocalStream(null); // Ensure localStream is null if permission fails
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
      throw err;
    }
  };

  // Call this to update preview when toggles change before joining
  useEffect(() => {
    if (!isConnected && sdkLoaded) { // Only update preview if not connected and SDK is ready
        initializeLocalMedia().catch(e => console.log("Preview media init error:", e));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraOn, isMicOn, sdkLoaded, isConnected]);

  const handleJoinMeeting = async () => {
    if (!meetingId.trim() || !userName.trim()) {
      setError('Please enter Meeting ID and Your Name.');
      return;
    }
    if (!sdkLoaded || !window.VideoSDK) {
      setError('Video SDK is not loaded yet. Please wait or check your connection.');
      return;
    }
    if (!API_KEY) {
        setError("Video SDK API Key is not configured. Cannot join meeting.");
        return;
    }

    setIsJoining(true);
    setError('');

    try {
      await initializeLocalMedia(); // Ensure media is initialized with current toggle states

      const token = await generateToken();
      if (!token) return; // Error already set by generateToken

      if (window.VideoSDK) {
        const meeting = window.VideoSDK.initMeeting({
          meetingId: meetingId,
          name: userName,
          apiKey: API_KEY,
          token: token, // Pass the token here
          containerId: 'video-container', // Ensure this div exists in your JSX
          micEnabled: isMicOn,
          webcamEnabled: isCameraOn,
          participantCanToggleSelfWebcam: true,
          participantCanToggleSelfMic: true,
          chatEnabled: true, // Example: enable chat
          screenShareEnabled: true, // Example: enable screen share
          // Ensure local media stream is passed if SDK supports/requires it
          // stream: localStream, // Depending on SDK, this might be needed or handled internally
        });

        meetingRef.current = meeting;

        meeting.on('meeting-joined', () => {
          console.log('Meeting joined successfully');
          setIsConnected(true);
          setParticipants([{ id: meeting.localParticipant.id, displayName: userName, isLocal: true }]);
        });

        meeting.on('meeting-left', () => {
          console.log('Meeting left');
          setIsConnected(false);
          setParticipants([]);
          if (localStream) { // Clean up local stream as well
            localStream.getTracks().forEach(track => track.stop());
            setLocalStream(null);
          }
          meetingRef.current = null; // Clear meeting ref
        });

        meeting.on('participant-joined', (participant: any) => {
          console.log('Participant joined:', participant);
          setParticipants(prev => [...prev, {id: participant.id, displayName: participant.displayName}]);
        });

        meeting.on('participant-left', (participant: any) => {
          console.log('Participant left:', participant);
          setParticipants(prev => prev.filter(p => p.id !== participant.id));
        });
        
        meeting.on('error', (errorData: any) => {
          console.error('Meeting error:', errorData);
          setError(`Meeting error: ${errorData.message || 'Unknown error'}`);
          setIsConnected(false); // Assume connection is lost on error
        });

        meeting.join();
      } else {
        throw new Error('Video SDK not loaded');
      }
    } catch (err: any) {
      console.error('Failed to join meeting:', err);
      setError(`Failed to join meeting: ${err.message || 'Please try again.'}`);
      // Ensure local stream is stopped if join fails after media init
      if (localStream && !isConnected) { // Check !isConnected in case of meeting error after join
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveMeeting = () => {
    if (meetingRef.current) {
      meetingRef.current.leave(); // SDK handles stream cleanup for its part
    }
    // Explicitly stop local stream tracks obtained by getUserMedia
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

    setIsConnected(false);
    setParticipants([]);
    setMeetingId(''); // Optionally reset meeting ID
    // setUserName(''); // Optionally reset user name
    meetingRef.current = null;
    toast({ title: "Meeting Ended", description: "You have left the meeting." });
  };

  const toggleCamera = () => {
    const newCameraState = !isCameraOn;
    setIsCameraOn(newCameraState);
    if (meetingRef.current && isConnected) {
      if (newCameraState) meetingRef.current.enableWebcam();
      else meetingRef.current.disableWebcam();
    }
    // For preview, re-initialize:
    // if (!isConnected) initializeLocalMedia(); // This is now handled by useEffect
  };

  const toggleMicrophone = () => {
    const newMicState = !isMicOn;
    setIsMicOn(newMicState);
    if (meetingRef.current && isConnected) {
      if (newMicState) meetingRef.current.unmuteMic();
      else meetingRef.current.muteMic();
    }
    // For preview, re-initialize:
    // if (!isConnected) initializeLocalMedia(); // This is now handled by useEffect
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


  if (!sdkLoaded && !error) {
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
        <title>Video Call - VideoSDK.live</title>
        <meta name="description" content="Video calling with VideoSDK.live" />
      </Head>

      <div className="min-h-screen bg-gray-900 text-white flex flex-col">
        {!isConnected ? (
          <div className="flex items-center justify-center flex-1 p-4">
            <Card className="bg-gray-800 border-gray-700 shadow-xl w-full max-w-md">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl font-bold">Join Video Call</CardTitle>
                <CardDescription className="text-gray-400">Connect with VideoSDK.live</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error && (
                  <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded-md text-sm text-center">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="userName" className="text-sm font-medium text-gray-300">Your Name</Label>
                  <Input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="bg-gray-700 border-gray-600 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
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
                      className="flex-1 bg-gray-700 border-gray-600 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter or Generate ID"
                    />
                    <Button
                      onClick={generateRandomMeetingId}
                      variant="outline"
                      className="bg-gray-600 hover:bg-gray-500 border-gray-500 text-gray-200"
                      size="icon"
                      aria-label="Generate Meeting ID"
                    >
                      <RefreshCw size={18} />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-start space-x-6 pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="cameraOn" checked={isCameraOn} onCheckedChange={(checked) => setIsCameraOn(!!checked)} />
                    <Label htmlFor="cameraOn" className="text-sm text-gray-300">Camera On</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="micOn" checked={isMicOn} onCheckedChange={(checked) => setIsMicOn(!!checked)} />
                    <Label htmlFor="micOn" className="text-sm text-gray-300">Mic On</Label>
                  </div>
                </div>

                <Button
                  onClick={handleJoinMeeting}
                  disabled={isJoining || !sdkLoaded}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium py-3"
                  size="lg"
                >
                  {isJoining ? <Loader2 className="animate-spin mr-2" /> : null}
                  {isJoining ? 'Joining...' : 'Join Meeting'}
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
                        className="w-full h-full object-cover transform scale-x-[-1]" // Flip local video
                        />
                        {!localStream && !error && ( // Show loading if no stream and no error yet related to media
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
                         {error.includes("camera/microphone") && ( // Specific error for media
                            <div className="absolute inset-0 bg-gray-800/90 flex flex-col items-center justify-center text-center p-4">
                                <CameraOff className="h-10 w-10 text-red-400 mb-2" />
                                <p className="text-sm text-red-300">{error}</p>
                                <p className="text-xs text-gray-400 mt-1">Check browser permissions.</p>
                            </div>
                        )}
                    </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Video Call Interface
          <div className="h-full flex flex-col">
            <header className="bg-gray-800 p-3 flex justify-between items-center border-b border-gray-700">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">Meeting ID: {meetingId}</h1>
                <div className="flex items-center gap-1.5 text-sm text-gray-400 bg-gray-700 px-2 py-1 rounded-md">
                  <Users size={16} />
                  <span>{currentParticipantCount}</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => {
                navigator.clipboard.writeText(meetingId);
                toast({title: "Meeting ID Copied!", description: meetingId});
              }}
              className="text-gray-300 hover:bg-gray-700 hover:text-white"
              >Copy ID</Button>
            </header>

            <main className="flex-1 p-2 md:p-4 overflow-hidden bg-gray-900">
              {/* This div is where VideoSDK.live will render its UI */}
              <div id="video-container" className="w-full h-full bg-black rounded-lg shadow-2xl border border-gray-700">
                {/* VideoSDK will populate this container */}
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
};

export default VideoSDKCallPage;