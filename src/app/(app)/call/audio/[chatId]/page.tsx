
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, MicOff, PhoneOff, Loader2, ShieldAlert } from "lucide-react";
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

export default function AudioCallPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const chatId = params.chatId as string;

  const [chatPartner, setChatPartner] = useState<ChatPartner | null>(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(true);
  
  const localAudioRef = useRef<HTMLAudioElement>(null); 

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [hasPermission, setHasPermission] = useState(true); 
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [callStatus, setCallStatus] = useState("Connecting...");


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
             // Fallback if partner logic fails for some reason (e.g. chat with self, though UI should prevent this)
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setLocalStream(stream);
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream; 
        }
        setHasPermission(true);
        setCallStatus(chatPartner ? `Ringing ${chatPartner.name}...` : "Ringing...");
      } catch (error) {
        console.error("Error accessing microphone:", error);
        setHasPermission(false);
        setCallStatus("Permission Denied");
        toast({
          variant: "destructive",
          title: "Microphone Access Denied",
          description: "Please enable microphone permission in your browser settings.",
          duration: 5000,
        });
      }
    };

    if (chatPartner && !isLoadingPartner) { 
        getMediaPermissions();
    }
    

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatPartner, isLoadingPartner]); 

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicMuted(prev => !prev);
      toast({ title: `Microphone ${!isMicMuted ? "Muted" : "Unmuted"}` });
    }
  };

  const handleEndCall = () => {
     if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    toast({ title: "Call Ended" });
    router.back();
  };

  if (authLoading || isLoadingPartner || !chatPartner) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-800 text-white">
        <Loader2 className="h-12 w-12 animate-spin" />
        <p className="mt-4">Loading call...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white">
      {/* Call Header */}
      <header className="flex items-center p-3 border-b border-gray-700 bg-gray-700 sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="mr-2 text-white hover:bg-gray-600" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h2 className="font-semibold">{chatPartner.name}</h2>
          <p className="text-xs text-green-400">{callStatus}</p>
        </div>
        <div className="w-10"></div>
      </header>

      {/* Main Call Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-8">
        {!hasPermission && (
           <Alert variant="destructive" className="w-auto max-w-md">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Permission Required</AlertTitle>
            <AlertDescription>
              Microphone access is required for audio calls. Please enable it in your browser settings and refresh.
            </AlertDescription>
          </Alert>
        )}

        <Avatar className="h-40 w-40 border-4 border-gray-600 shadow-lg">
          <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
          <AvatarFallback className="text-5xl bg-gray-700">{chatPartner.name.substring(0, 1)}</AvatarFallback>
        </Avatar>
        
        <audio ref={localAudioRef} muted autoPlay playsInline className="hidden" />
        {/* <audio ref={remoteAudioRef} autoPlay playsInline /> Remote audio placeholder */}

        <p className="text-lg">Audio call with {chatPartner.name}</p>
        <p className="text-sm text-gray-400">Full call functionality (connecting to partner) is coming soon.</p>
      </div>

      {/* Call Controls Footer */}
      <footer className="p-6 border-t border-gray-700 bg-gray-700 sticky bottom-0 z-10">
        <div className="flex items-center justify-center space-x-6">
          <Button variant="outline" size="lg" className="rounded-full p-4 bg-gray-600 border-gray-500 text-white hover:bg-gray-500" onClick={toggleMic} disabled={!hasPermission}>
            {isMicMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </Button>
          <Button variant="destructive" size="lg" className="rounded-full p-4 bg-red-600 hover:bg-red-700" onClick={handleEndCall}>
            <PhoneOff className="h-7 w-7" />
          </Button>
        </div>
         <p className="text-center text-xs text-gray-400 mt-3">WebRTC P2P connection not yet implemented. This is a local media preview.</p>
      </footer>
    </div>
  );
}
