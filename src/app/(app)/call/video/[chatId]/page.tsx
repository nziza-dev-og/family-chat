
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";

interface ChatPartner {
  uid: string;
  name: string;
  avatar: string;
  dataAiHint: string;
}

export default function VideoCallPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const chatId = params.chatId as string;

  const [chatPartner, setChatPartner] = useState<ChatPartner | null>(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null); 

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState(true); 
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  useEffect(() => {
    if (!chatId || !user) {
        setIsLoadingPartner(false);
        return;
    }
    setIsLoadingPartner(true);
    const fetchChatPartnerDetails = async () => {
      try {
        const chatDocRef = doc(db, "chats", chatId);
        const chatDocSnap = await getDoc(chatDocRef);

        if (chatDocSnap.exists()) {
          const chatData = chatDocSnap.data();
          const partnerId = chatData.participants.find((pId: string) => pId !== user.uid); 

          if (partnerId) {
            const userDocRef = doc(db, "users", partnerId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              const partnerData = userDocSnap.data();
              setChatPartner({
                uid: partnerId,
                name: partnerData.displayName || "Chat User",
                avatar: partnerData.photoURL || "https://placehold.co/100x100.png",
                dataAiHint: "person portrait",
              });
            } else {
               setChatPartner({ uid: "unknown", name: "Chat User", avatar: "https://placehold.co/100x100.png", dataAiHint: "person portrait"});
            }
          } else if (chatData.isGroup) {
             setChatPartner({ uid: chatId, name: chatData.groupName || "Call Partner", avatar: chatData.groupAvatar || "https://placehold.co/100x100.png", dataAiHint: "group people"});
          } else {
             setChatPartner({ uid: "unknown", name: "Call Partner", avatar: "https://placehold.co/100x100.png", dataAiHint: "person portrait"});
          }
        } else {
          toast({ title: "Error", description: "Chat not found.", variant: "destructive" });
          router.replace("/chats");
        }
      } catch (error) {
        console.error("Error fetching chat partner details:", error);
        toast({ title: "Error", description: "Could not load partner details.", variant: "destructive" });
      } finally {
        setIsLoadingPartner(false);
      }
    };
    fetchChatPartnerDetails();
  }, [chatId, router, toast, user]);

  useEffect(() => {
    const getMediaPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        setHasPermission(true);
      } catch (error) {
        console.error("Error accessing media devices:", error);
        setHasPermission(false);
        toast({
          variant: "destructive",
          title: "Media Access Denied",
          description: "Please enable camera and microphone permissions in your browser settings.",
          duration: 5000,
        });
      }
    };

    if (!isLoadingPartner) { // Only get permissions if partner loading is done (success or fail)
        getMediaPermissions();
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingPartner]); 

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicMuted(prev => !prev);
      toast({ title: `Microphone ${!isMicMuted ? "Muted" : "Unmuted"}` });
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(prev => !prev);
      toast({ title: `Camera ${!isCameraOff ? "Off" : "On"}` });
    }
  };

  const handleEndCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    toast({ title: "Call Ended" });
    router.back(); 
  };

  if (authLoading || isLoadingPartner) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-900 text-white">
        <Loader2 className="h-12 w-12 animate-spin" />
        <p className="mt-4">Loading call...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Call Header */}
      <header className="flex items-center p-3 border-b border-gray-700 bg-gray-800 sticky top-0 z-20">
        <Button variant="ghost" size="icon" className="mr-2 text-white hover:bg-gray-700" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {chatPartner && (
          <>
            <Avatar className="h-10 w-10 mr-3 border-2 border-gray-600">
              <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
              <AvatarFallback>{chatPartner.name.substring(0, 1)}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="font-semibold">{chatPartner.name}</h2>
              <p className="text-xs text-green-400">Video call in progress...</p>
            </div>
          </>
        )}
      </header>

      {/* Video Feeds Area */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center p-4 gap-4 relative">
        {!hasPermission && (
          <Alert variant="destructive" className="absolute top-4 left-1/2 -translate-x-1/2 w-auto max-w-md z-30">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Permissions Required</AlertTitle>
            <AlertDescription>
              Camera and microphone access is required for video calls. Please enable them in your browser settings and refresh.
            </AlertDescription>
          </Alert>
        )}
      
        {/* Remote Video (Placeholder) */}
        <div className="w-full h-1/2 md:h-full md:flex-1 bg-black rounded-lg flex items-center justify-center border border-gray-700 shadow-lg overflow-hidden">
          <video ref={remoteVideoRef} className="w-full h-full object-cover rounded-lg" autoPlay playsInline data-ai-hint="video call remote" />
          {!chatPartner && <p className="text-muted-foreground">Waiting for partner...</p>}
           {chatPartner && (
            <div className="absolute bottom-2 left-2 bg-black/50 p-1 px-2 rounded text-xs">
              {chatPartner.name}
            </div>
          )}
        </div>

        {/* Local Video */}
        <div className="w-48 h-32 md:w-64 md:h-48 absolute bottom-4 right-4 md:static md:self-end bg-black rounded-lg border-2 border-blue-500 shadow-xl overflow-hidden">
          <video ref={localVideoRef} className="w-full h-full object-cover" autoPlay muted playsInline data-ai-hint="video call local" />
           <div className="absolute bottom-1 left-1 bg-black/50 p-0.5 px-1 rounded text-xs">
              You
            </div>
        </div>
      </div>

      {/* Call Controls Footer */}
      <footer className="p-4 border-t border-gray-700 bg-gray-800 sticky bottom-0 z-20">
        <div className="flex items-center justify-center space-x-4">
          <Button variant="ghost" size="lg" className="rounded-full p-3 text-white hover:bg-gray-700" onClick={toggleMic} disabled={!hasPermission}>
            {isMicMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>
          <Button variant="ghost" size="lg" className="rounded-full p-3 text-white hover:bg-gray-700" onClick={toggleCamera} disabled={!hasPermission}>
            {isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </Button>
          <Button variant="destructive" size="lg" className="rounded-full p-3 bg-red-600 hover:bg-red-700" onClick={handleEndCall}>
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">WebRTC P2P connection not yet implemented. This is a local media preview.</p>
      </footer>
    </div>
  );
}
