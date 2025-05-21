
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, MicOff, PhoneOff, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, deleteDoc, getDocs, writeBatch, query, where, Timestamp } from "firebase/firestore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useIncomingCall } from "@/contexts/IncomingCallContext";

interface ChatPartner {
  uid: string;
  name: string;
  avatar: string;
  dataAiHint: string;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function AudioCallPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { clearIncomingCall, incomingCall } = useIncomingCall();
  const chatId = params.chatId as string;

  const [chatPartner, setChatPartner] = useState<ChatPartner | null>(null);
  const [isLoadingPartner, setIsLoadingPartner] = useState(true);
  
  const localAudioRef = useRef<HTMLAudioElement>(null); 
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const [hasPermission, setHasPermission] = useState(true); 
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [callStatus, setCallStatus] = useState("Initializing...");

  const callDocRef = doc(db, "calls", chatId);
  const iceCandidateCollectionRef = collection(callDocRef, "iceCandidates");
  
  const iceCandidateListenersUnsubscribeRef = useRef<(() => void) | null>(null);
  const callDocUnsubscribeRef = useRef<(() => void) | null>(null);

  const cleanupCall = useCallback(async (updateFirestoreStatus = true) => {
    console.log("Cleaning up audio call for chatId:", chatId);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (iceCandidateListenersUnsubscribeRef.current) {
        iceCandidateListenersUnsubscribeRef.current();
        iceCandidateListenersUnsubscribeRef.current = null;
    }
    if (callDocUnsubscribeRef.current) {
        callDocUnsubscribeRef.current();
        callDocUnsubscribeRef.current = null;
    }

    if (updateFirestoreStatus) {
        try {
            const callSnap = await getDoc(callDocRef);
            if (callSnap.exists()) {
                const callData = callSnap.data();
                if (callData.callerId === user?.uid || callData.calleeId === user?.uid) {
                    await updateDoc(callDocRef, { status: "ended", offer: null, answer: null, updatedAt: Timestamp.now() });
                    const iceCandidatesSnap = await getDocs(iceCandidateCollectionRef);
                    const batch = writeBatch(db);
                    iceCandidatesSnap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            }
        } catch (error) {
            console.warn("Error during call document cleanup:", error);
        }
    }
    setCallStatus("Call Ended");
  }, [chatId, callDocRef, iceCandidateCollectionRef, user?.uid]);


  useEffect(() => {
    if (!chatId || !user) {
        setIsLoadingPartner(false);
        return;
    }
    setIsLoadingPartner(true);
    const fetchChatPartnerDetails = async () => {
      try {
        const chatDocSnap = await getDoc(doc(db, "chats", chatId));
        if (chatDocSnap.exists()) {
          const chatData = chatDocSnap.data();
          const partnerId = chatData.participants.find((pId: string) => pId !== user.uid); 
          if (partnerId) {
            const userDocSnap = await getDoc(doc(db, "users", partnerId));
            if (userDocSnap.exists()) {
              const partnerData = userDocSnap.data();
              setChatPartner({
                uid: partnerId,
                name: partnerData.displayName || "Chat User",
                avatar: partnerData.photoURL || "https://placehold.co/100x100.png",
                dataAiHint: "person portrait",
              });
            } else { setChatPartner({ uid: "unknown", name: "Chat User", avatar: "https://placehold.co/100x100.png", dataAiHint: "person portrait"}); }
          } else {
             toast({ title: "Error", description: "Could not determine chat partner.", variant: "destructive" });
             router.replace("/chats");
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
  }, [chatId, user, router, toast]);

  useEffect(() => {
    if (authLoading || isLoadingPartner || !user || !chatPartner) return;

    if (incomingCall && incomingCall.chatId === chatId) {
      clearIncomingCall();
    }

    const initialize = async () => {
      setCallStatus("Requesting permissions...");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
        if (localAudioRef.current) {
          localAudioRef.current.srcObject = stream; 
        }
        setHasPermission(true);
        setCallStatus("Initializing connection...");

        peerConnectionRef.current = new RTCPeerConnection(ICE_SERVERS);

        localStreamRef.current.getTracks().forEach(track => {
          peerConnectionRef.current!.addTrack(track, localStreamRef.current!);
        });

        remoteStreamRef.current = new MediaStream();
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }
        peerConnectionRef.current.ontrack = event => {
          event.streams[0].getTracks().forEach(track => {
            remoteStreamRef.current!.addTrack(track);
          });
          if (remoteAudioRef.current) remoteAudioRef.current.play().catch(e => console.error("Error playing remote audio:", e));
          setCallStatus("Connected");
          updateDoc(callDocRef, { status: "active", updatedAt: Timestamp.now() }).catch(console.error);
        };

        peerConnectionRef.current.onicecandidate = event => {
          if (event.candidate) {
            addDoc(iceCandidateCollectionRef, {
              candidate: event.candidate.toJSON(),
              senderId: user.uid,
              recipientId: chatPartner.uid,
            });
          }
        };
        
        await setupSignaling();

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

    initialize();
    return () => {
      cleanupCall(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, isLoadingPartner, chatPartner, clearIncomingCall]);


  const setupSignaling = useCallback(async () => {
    if (!user || !peerConnectionRef.current || !chatPartner) return;
    const pc = peerConnectionRef.current;

    callDocUnsubscribeRef.current = onSnapshot(callDocRef, async (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      if (data.status === 'declined' || data.status === 'ended') {
        toast({ title: "Call Ended", description: `The call was ${data.status}.` });
        await cleanupCall(false);
        router.back();
        return;
      }

      if (data.offer && data.calleeId === user.uid && !pc.currentRemoteDescription && data.status === 'ringing') {
        setCallStatus("Offer received, creating answer...");
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await updateDoc(callDocRef, { 
            answer: pc.localDescription.toJSON(), // Corrected: Use pc.localDescription
            status: "answered",
            updatedAt: Timestamp.now()
        });
        setCallStatus("Answer sent, connecting...");
      }

      if (data.answer && data.callerId === user.uid && pc.signalingState === "have-local-offer") {
        if (!pc.currentRemoteDescription) {
            setCallStatus("Answer received, connecting...");
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      }
    });

    const qIceCandidates = query(
      iceCandidateCollectionRef,
      where("recipientId", "==", user.uid)
    );
    iceCandidateListenersUnsubscribeRef.current = onSnapshot(qIceCandidates, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
           if (pc.signalingState !== "closed" && change.doc.data().candidate) {
             try {
                await pc.addIceCandidate(new RTCIceCandidate(change.doc.data().candidate));
             } catch (e) {
                console.error("Error adding received ICE candidate", e);
             }
           }
        }
      });
    });

    const callSnap = await getDoc(callDocRef);
    if (!callSnap.exists() || (callSnap.data()?.callerId !== user.uid && callSnap.data()?.calleeId !== user.uid)) {
      if (!callSnap.exists() || (callSnap.data()?.status !== 'ringing' && callSnap.data()?.status !== 'answered')) {
        setCallStatus("Creating offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await setDoc(callDocRef, { 
            offer: pc.localDescription.toJSON(), // Corrected: Use pc.localDescription
            callerId: user.uid,
            calleeId: chatPartner.uid,
            callType: 'audio',
            status: 'ringing',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });
        setCallStatus("Calling partner, waiting for answer...");
      }
    } else if (callSnap.exists() && callSnap.data()?.callerId === user.uid && !callSnap.data()?.answer && callSnap.data()?.status === 'ringing') {
        setCallStatus("Calling partner, waiting for answer...");
    }
  }, [user, chatPartner, callDocRef, iceCandidateCollectionRef, router, toast, cleanupCall]);

  const toggleMic = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicMuted(prev => !prev);
      toast({ title: `Microphone ${!isMicMuted ? "Muted" : "Unmuted"}` });
    }
  };

  const handleEndCall = async () => {
    await cleanupCall(true);
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
      <header className="flex items-center p-3 border-b border-gray-700 bg-gray-700 sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="mr-2 text-white hover:bg-gray-600" onClick={handleEndCall}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h2 className="font-semibold">{chatPartner.name}</h2>
          <p className="text-xs text-green-400 capitalize">{callStatus.toLowerCase()}</p>
        </div>
        <div className="w-10"></div> {/* Spacer */}
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-8">
        {!hasPermission && callStatus === "Permission Denied" && (
           <Alert variant="destructive" className="w-auto max-w-md">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>Permission Required</AlertTitle>
            <AlertDescription>
              Microphone access is required. Please enable it in browser settings.
            </AlertDescription>
          </Alert>
        )}

        <Avatar className="h-40 w-40 border-4 border-gray-600 shadow-lg">
          <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
          <AvatarFallback className="text-5xl bg-gray-700">{chatPartner.name.substring(0, 1)}</AvatarFallback>
        </Avatar>
        
        <audio ref={localAudioRef} muted autoPlay playsInline className="hidden" />
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        <p className="text-lg">Audio call with {chatPartner.name}</p>
         {callStatus !== "Connected" && (
           <p className="text-sm text-gray-400">{callStatus === "Initializing..." || callStatus === "Requesting permissions..." || callStatus === "Initializing connection..." ? "Setting up..." : "Attempting to connect..."}</p>
        )}
      </div>

      <footer className="p-6 border-t border-gray-700 bg-gray-700 sticky bottom-0 z-10">
        <div className="flex items-center justify-center space-x-6">
          <Button variant="outline" size="lg" className="rounded-full p-4 bg-gray-600 border-gray-500 text-white hover:bg-gray-500" onClick={toggleMic} disabled={!hasPermission}>
            {isMicMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </Button>
          <Button variant="destructive" size="lg" className="rounded-full p-4 bg-red-600 hover:bg-red-700" onClick={handleEndCall}>
            <PhoneOff className="h-7 w-7" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
