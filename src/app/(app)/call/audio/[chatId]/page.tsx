
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mic, MicOff, PhoneOff, Loader2, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc, onSnapshot, collection, addDoc, deleteDoc, getDocs, writeBatch, serverTimestamp, Unsubscribe, Timestamp } from "firebase/firestore";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useIncomingCall } from "@/contexts/IncomingCallContext";
import { addMissedCallMessage } from "@/lib/chatActions";

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
  iceCandidatePoolSize: 10,
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
  const callStatusRef = useRef(callStatus);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  const roomDocRef = doc(db, "rooms", chatId);
  const callerCandidatesCollectionRef = collection(roomDocRef, "callerCandidates");
  const calleeCandidatesCollectionRef = collection(roomDocRef, "calleeCandidates");
  
  const iceListenersUnsubscribeRef = useRef<Unsubscribe[]>([]);
  const roomUnsubscribeRef = useRef<Unsubscribe | null>(null);
  
  const cleanupCall = useCallback(async (updateFirestoreStatus = true, isCallerInitiatedEnd = false) => {
    const currentCallStatus = callStatusRef.current; 
    console.log(`[${chatId}] AUDIO Cleaning up. Update Firestore: ${updateFirestoreStatus}, CallerEnd: ${isCallerInitiatedEnd}, CurrentStatus: ${currentCallStatus}`);
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.onsignalingstatechange = null;
      peerConnectionRef.current.onicegatheringstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    iceListenersUnsubscribeRef.current.forEach(unsubscribe => unsubscribe());
    iceListenersUnsubscribeRef.current = [];
    if (roomUnsubscribeRef.current) {
        roomUnsubscribeRef.current();
        roomUnsubscribeRef.current = null;
    }

    if (updateFirestoreStatus && user) {
        try {
            const roomSnap = await getDoc(roomDocRef);
            if (roomSnap.exists()) {
                const roomData = roomSnap.data();
                 if (roomData.callerId === user.uid || roomData.calleeId === user.uid) {
                    if (isCallerInitiatedEnd && roomData.callerId === user.uid && roomData.status === 'ringing' && chatPartner) {
                        console.log(`[${chatId}] AUDIO Caller (self) ending a ringing call. Adding missed call message for partner: ${chatPartner.uid}`);
                        await addMissedCallMessage(chatId, 'audio', user.uid, chatPartner.uid);
                    }
                    if (roomData.status !== 'ended' && roomData.status !== 'declined') {
                        await updateDoc(roomDocRef, { 
                            status: "ended", 
                            offer: null, 
                            answer: null, 
                            updatedAt: serverTimestamp() 
                        });
                    }
                    
                    const callerCandidatesSnap = await getDocs(callerCandidatesCollectionRef);
                    const calleeCandidatesSnap = await getDocs(calleeCandidatesCollectionRef);
                    const batch = writeBatch(db);
                    callerCandidatesSnap.forEach(doc => batch.delete(doc.ref));
                    calleeCandidatesSnap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit().catch(e => console.warn(`[${chatId}] AUDIO Error deleting ICE candidates:`, e));
                }
            }
        } catch (error) {
            console.warn(`[${chatId}] AUDIO Error during room document cleanup:`, error);
        }
    }
     if (currentCallStatus !== "Call Ended" && currentCallStatus !== "Call Failed") { 
      setCallStatus("Call Ended");
    }
  }, [chatId, roomDocRef, callerCandidatesCollectionRef, calleeCandidatesCollectionRef, user, chatPartner]); // Removed callStatus


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
            } else { 
                setChatPartner({ uid: "unknown", name: "Chat User", avatar: "https://placehold.co/100x100.png", dataAiHint: "person portrait"}); 
                toast({ title: "Error", description: "Chat partner data not found.", variant: "destructive" });
            }
          } else {
             toast({ title: "Error", description: "Could not determine chat partner.", variant: "destructive" });
             router.replace("/chats");
          }
        } else {
          toast({ title: "Error", description: "Chat not found.", variant: "destructive" });
          router.replace("/chats");
        }
      } catch (error) {
        console.error(`[${chatId}] AUDIO Error fetching chat partner details:`, error);
        toast({ title: "Error", description: "Could not load partner details.", variant: "destructive" });
      } finally {
        setIsLoadingPartner(false);
      }
    };
    fetchChatPartnerDetails();
  }, [chatId, user, router, toast]);

  const registerPeerConnectionListeners = useCallback(() => {
    if (!peerConnectionRef.current) return;
    const pc = peerConnectionRef.current;

    pc.onicegatheringstatechange = () => {
      if (!peerConnectionRef.current) return;
      console.log(`[${chatId}] AUDIO ICE gathering state changed: ${peerConnectionRef.current.iceGatheringState}`);
    };
    pc.onconnectionstatechange = async () => {
      if (!peerConnectionRef.current) return; 
      const currentState = peerConnectionRef.current.connectionState;
      console.log(`[${chatId}] AUDIO Connection state change: ${currentState}, Current CallStatus via Ref: ${callStatusRef.current}`);
       setCallStatus(prevStatus => {
        let newStatus = prevStatus;
        if (currentState === 'connected') {
          newStatus = "Connected";
           if (user) {
             updateDoc(roomDocRef, { status: "active", updatedAt: serverTimestamp() }).catch(e => console.warn(`[${chatId}] AUDIO Error setting room to active:`, e));
          }
        } else if (currentState === 'disconnected') {
          newStatus = "Reconnecting...";
        } else if (currentState === 'failed') {
          newStatus = "Call Failed";
          cleanupCall(true, false);
        } else if (currentState === 'closed') {
          newStatus = "Call Ended";
        }
        return newStatus;
      });
    };
    pc.onsignalingstatechange = () => {
        if (!peerConnectionRef.current) return;
        console.log(`[${chatId}] AUDIO Signaling state change: ${peerConnectionRef.current.signalingState}`);
    };
  }, [chatId, user, roomDocRef, cleanupCall]); // Removed callStatus


  const setupSignaling = useCallback(async () => {
    if (!user || !peerConnectionRef.current || !chatPartner) {
        console.log(`[${chatId}] AUDIO setupSignaling pre-condition fail: user=${!!user}, pc=${!!peerConnectionRef.current}, partner=${!!chatPartner}`);
        return;
    }
    const pc = peerConnectionRef.current;

    roomUnsubscribeRef.current = onSnapshot(roomDocRef, async (snapshot) => {
      const roomData = snapshot.data();
      const currentCallStatusSnapshot = callStatusRef.current; // Use ref for latest status

      if (!roomData || roomData.status === 'declined' || roomData.status === 'ended') {
        const isEstablishing = currentCallStatusSnapshot === "Creating offer..." || 
                               currentCallStatusSnapshot === "Calling partner, waiting for answer..." || 
                               currentCallStatusSnapshot === "Initializing connection...";
        
        const isSelfCallerTryingToEstablish = 
            user && (
                (!roomData && isEstablishing) || 
                (roomData && roomData.callerId === user.uid && isEstablishing && (roomData.status === 'declined' || roomData.status === 'ended'))
            );

        if (isSelfCallerTryingToEstablish) {
          console.log(`[${chatId}] AUDIO Room snapshot: Room not ready/stale ('${roomData?.status || 'no room'}'), but current user (caller) is establishing. Skipping cleanup from snapshot. Current CallStatus: ${currentCallStatusSnapshot}`);
        } else if (currentCallStatusSnapshot !== "Call Ended" && currentCallStatusSnapshot !== "Call Failed") {
          toast({ title: "Call Ended", description: `The call was ${roomData ? roomData.status : 'terminated'}.` });
          await cleanupCall(false); 
          router.back();
        }
        return;
      }


      // Callee: Offer received, create answer
      if (roomData.offer && roomData.calleeId === user.uid && !pc.currentRemoteDescription && roomData.status === 'ringing') {
        setCallStatus("Offer received, creating answer...");
        try {
            if (pc.signalingState === "closed") {
                console.error(`[${chatId}] AUDIO Cannot set remote description from offer, PC is closed.`);
                setCallStatus("Call Failed");
                await cleanupCall(true, false); 
                return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));
            
            if (pc.signalingState === "closed") {
                console.error(`[${chatId}] AUDIO Cannot create answer, PC is closed after setting remote desc.`);
                setCallStatus("Call Failed");
                return;
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            if (pc.localDescription) { 
                await updateDoc(roomDocRef, { 
                    answer: pc.localDescription.toJSON(), 
                    status: "answered",
                    updatedAt: serverTimestamp()
                });
            }
            setCallStatus("Answer sent, connecting...");
        } catch(e) {
            console.error(`[${chatId}] AUDIO Error processing offer or creating answer:`, e);
            setCallStatus("Connection error");
            toast({title: "Connection Error", description: "Failed to process call offer.", variant: "destructive"});
            await cleanupCall(true, false);
        }
      }

      // Caller: Answer received
      if (roomData.answer && roomData.callerId === user.uid && pc.signalingState === "have-local-offer") {
        if (!pc.currentRemoteDescription) {
            setCallStatus("Answer received, connecting...");
            try {
                if (pc.signalingState === "closed") {
                    console.error(`[${chatId}] AUDIO Cannot set remote description from answer, PC is closed.`);
                    setCallStatus("Call Failed");
                    await cleanupCall(true, false);
                    return;
                }
                await pc.setRemoteDescription(new RTCSessionDescription(roomData.answer));
            } catch (e) {
                console.error(`[${chatId}] AUDIO Error setting remote description from answer:`, e);
                setCallStatus("Connection error");
                toast({title: "Connection Error", description: "Failed to process call answer.", variant: "destructive"});
                await cleanupCall(true, false);
            }
        }
      }
    });

    const initialRoomSnap = await getDoc(roomDocRef);
    const initialRoomData = initialRoomSnap.data();
    const amICallerForThisSetup = !initialRoomData || initialRoomData.callerId === user.uid || (initialRoomData.calleeId === user.uid && initialRoomData.status !== 'ringing');
    
    const candidatesToListenCollection = amICallerForThisSetup ? calleeCandidatesCollectionRef : callerCandidatesCollectionRef;
    const candidatesToSendToCollection = amICallerForThisSetup ? callerCandidatesCollectionRef : calleeCandidatesCollectionRef;


    const iceUnsubscribe = onSnapshot(candidatesToListenCollection, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
           if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== "closed" && change.doc.data().candidate) {
             try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(change.doc.data().candidate));
             } catch (e) {
                if (peerConnectionRef.current && peerConnectionRef.current.signalingState !== "closed") { 
                    console.warn(`[${chatId}] AUDIO Error adding received ICE candidate:`, e);
                }
             }
           }
        }
      });
    });
    iceListenersUnsubscribeRef.current.push(iceUnsubscribe);

     if (pc && pc.signalingState !== 'closed') {
        pc.onicecandidate = async event => {
            if (event.candidate && user && chatPartner && peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') {
                await addDoc(candidatesToSendToCollection, { candidate: event.candidate.toJSON() });
            }
        };
    }

    if (!initialRoomData || 
        initialRoomData.status === 'ended' || 
        initialRoomData.status === 'declined' ||
        (initialRoomData.callerId !== user.uid && initialRoomData.calleeId !== user.uid) || 
        (initialRoomData.calleeId === user.uid && initialRoomData.status !== 'ringing')
       ) {
        setCallStatus("Creating offer...");
        try {
            if (pc.signalingState === "closed") {
                console.error(`[${chatId}] AUDIO Cannot create offer, PC is already closed before attempt.`);
                setCallStatus("Call Failed");
                return;
            }
            const offer = await pc.createOffer();
            
            if (pc.signalingState === "closed") { // Check again after createOffer
                console.error(`[${chatId}] AUDIO PC closed after createOffer was called.`);
                setCallStatus("Call Failed");
                return;
            }
            await pc.setLocalDescription(offer);

            if (!pc.localDescription) { // Check if localDescription is set
                console.error(`[${chatId}] AUDIO localDescription is null after setLocalDescription.`);
                setCallStatus("Call Failed");
                return;
            }

            await setDoc(roomDocRef, { 
                offer: pc.localDescription.toJSON(),
                callerId: user.uid,
                calleeId: chatPartner.uid,
                callType: 'audio',
                status: 'ringing',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            setCallStatus("Calling partner, waiting for answer...");
        } catch (e: any) {
            console.error(`[${chatId}] AUDIO Error creating offer:`, e);
            setCallStatus("Failed to start call");
            toast({title: "Call Error", description: e.message || "Could not initiate the call.", variant: "destructive"});
            await cleanupCall(true, false);
        }
    } else if (initialRoomData.callerId === user.uid && !initialRoomData.answer && initialRoomData.status === 'ringing') {
        setCallStatus("Calling partner, waiting for answer..."); 
    } else if (initialRoomData.calleeId === user.uid && initialRoomData.status === 'ringing' && !initialRoomData.answer) {
        setCallStatus("Waiting for connection setup..."); 
    }
  }, [user, chatPartner, roomDocRef, callerCandidatesCollectionRef, calleeCandidatesCollectionRef, router, toast, cleanupCall, chatId]); // Removed callStatus 

  useEffect(() => {
    if (authLoading || isLoadingPartner || !user || !chatPartner) {
        return;
    }
    if ( (peerConnectionRef.current && peerConnectionRef.current.signalingState !== 'closed') || 
         callStatusRef.current === "Call Ended" || callStatusRef.current === "Call Failed"
       ) {
        console.log(`[${chatId}] AUDIO Call already initialized or ended, skipping. PC: ${!!peerConnectionRef.current}, SignalingState: ${peerConnectionRef.current?.signalingState}, Status via Ref: ${callStatusRef.current}`);
        return;
    }

    if (incomingCall && incomingCall.chatId === chatId) {
      clearIncomingCall('answered');
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

        const pc = new RTCPeerConnection(ICE_SERVERS);
        peerConnectionRef.current = pc;
        registerPeerConnectionListeners();
        
        localStreamRef.current.getTracks().forEach(track => {
          if(localStreamRef.current && peerConnectionRef.current) peerConnectionRef.current.addTrack(track, localStreamRef.current);
        });

        remoteStreamRef.current = new MediaStream();
        if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }
        pc.ontrack = event => {
          event.streams[0].getTracks().forEach(track => {
            if (remoteStreamRef.current) remoteStreamRef.current.addTrack(track);
          });
          if (remoteAudioRef.current && remoteAudioRef.current.paused) {
             remoteAudioRef.current.play().catch(e => console.error(`[${chatId}] AUDIO Error playing remote audio:`, e));
          }
        };
        
        await setupSignaling();

      } catch (error: any) {
        console.error(`[${chatId}] AUDIO Error accessing microphone or during init:`, error);
        setHasPermission(false);
        setCallStatus(error.name === "NotFoundError" || error.name === "DevicesNotFoundError" ? "No Microphone" : "Permission Denied");
        toast({
          variant: "destructive",
          title: error.name === "NotFoundError" || error.name === "DevicesNotFoundError" ? "No Microphone Found" : "Microphone Access Denied",
          description: error.message || "Please enable microphone permission or connect a microphone.",
          duration: 5000,
        });
      }
    };

    initialize();
    
    return () => {
      console.log(`[${chatId}] AUDIO Unmounting AudioCallPage. Visibility: ${document.visibilityState}`);
      if (document.visibilityState === 'hidden') {
        console.log(`[${chatId}] AUDIO Page hidden, cleaning up local resources only (no Firestore status update).`);
        cleanupCall(false, false); 
      } else {
        console.log(`[${chatId}] AUDIO Page unmounting/closing, full cleanup.`);
        cleanupCall(true, false);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, isLoadingPartner, chatPartner, chatId, clearIncomingCall, cleanupCall, setupSignaling, registerPeerConnectionListeners]);


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
    let isCallerEndingRingingCall = false;
    if (user && chatPartner && peerConnectionRef.current) { 
      const roomSnap = await getDoc(roomDocRef);
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        if (roomData.callerId === user.uid && roomData.status === 'ringing') {
          isCallerEndingRingingCall = true; 
        }
      }
    }
    await cleanupCall(true, isCallerEndingRingingCall);
    if (callStatusRef.current !== "Call Ended" && callStatusRef.current !== "Call Failed") { 
        toast({ title: "Call Ended" });
    }
    router.back();
  };

  if (authLoading || isLoadingPartner) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-800 text-white">
        <Loader2 className="h-12 w-12 animate-spin" />
        <p className="mt-4">Loading call...</p>
      </div>
    );
  }

  if (!user || !chatPartner) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-gray-800 text-white">
        <ShieldAlert className="h-12 w-12 text-red-500" />
        <p className="mt-4">Call information unavailable. Please try again.</p>
        <Button onClick={() => router.replace("/chats")} className="mt-4">Back to Chats</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-800 text-white">
      <header className="flex items-center p-3 border-b border-gray-700 bg-gray-700 sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="mr-2 text-white hover:bg-gray-600" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h2 className="font-semibold">{chatPartner.name}</h2>
          <p className="text-xs text-green-400 capitalize">{callStatus.toLowerCase()}</p>
        </div>
        <div className="w-10"></div> {/* Spacer */}
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-8">
        {!hasPermission && (callStatus === "Permission Denied" || callStatus === "Failed to start call" || callStatus === "No Microphone") && (
           <Alert variant="destructive" className="w-auto max-w-md">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle>{callStatus === "No Microphone" ? "No Microphone Found" : "Permission or Setup Required"}</AlertTitle>
            <AlertDescription>
              {callStatus === "No Microphone" ? "Please connect a microphone to make audio calls." : "Microphone access is required, or the call could not be initiated. Please check permissions and try again."}
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
         {callStatus !== "Connected" && callStatus !== "Call Ended" && callStatus !== "Reconnecting..." && callStatus !== "Call Failed" && callStatus !== "Permission Denied" && callStatus !== "No Microphone" && (
           <p className="text-sm text-gray-400">
            {callStatus === "Initializing..." || callStatus === "Requesting permissions..." || callStatus === "Initializing connection..." ? 
            "Setting up..." : 
            (callStatus === "Creating offer..." || callStatus === "Calling partner, waiting for answer...") ? "Calling..." : "Attempting to connect..."}
           </p>
        )}
        {callStatus === "Reconnecting..." && (
            <p className="text-sm text-yellow-400 animate-pulse">Reconnecting...</p>
        )}
         {callStatus === "Call Failed" && (
            <p className="text-sm text-red-400">Call Failed. Please try again.</p>
        )}
      </div>

      <footer className="p-6 border-t border-gray-700 bg-gray-700 sticky bottom-0 z-10">
        <div className="flex items-center justify-center space-x-6">
          <Button variant="outline" size="lg" className="rounded-full p-4 bg-gray-600 border-gray-500 text-white hover:bg-gray-500" onClick={toggleMic} disabled={!hasPermission || callStatus === "Call Ended" || callStatus === "Call Failed" || callStatus === "Permission Denied" || callStatus === "No Microphone"}>
            {isMicMuted ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </Button>
          <Button variant="destructive" size="lg" className="rounded-full p-4 bg-red-600 hover:bg-red-700" onClick={handleEndCall} disabled={(callStatus === "Call Ended" || callStatus === "Call Failed")}>
            <PhoneOff className="h-7 w-7" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

