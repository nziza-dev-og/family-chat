
"use client";

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'; // Added useRef
import { useRouter, usePathname } from 'next/navigation';
import { db } from "@/lib/firebase";
import { doc, updateDoc, getDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ChatUser } from '@/lib/chatActions';
import { addMissedCallMessage } from '@/lib/chatActions';
import { useAuth } from '@/hooks/useAuth';

export interface IncomingCallData {
  chatId: string;
  caller: ChatUser;
  callType: 'audio' | 'video' | 'videosdk';
  callDocId: string; // Firestore doc ID for custom WebRTC calls (rooms collection) or videoCallInvites doc ID
  videosdkMeetingId?: string; // Meeting ID for VideoSDK calls
}

interface IncomingCallContextType {
  incomingCall: IncomingCallData | null;
  showIncomingCallDialog: boolean;
  presentIncomingCall: (callData: IncomingCallData) => void;
  answerCall: () => void;
  declineCall: () => void;
  clearIncomingCall: (
    reason?: 'answered' | 'declined_by_user' | 'call_ended_by_other' | 'navigating_away',
    detailsForMissedCall?: { callType: 'audio' | 'video' | 'videosdk'; callerId: string; calleeId: string, chatId: string }
  ) => void;
}

const IncomingCallContext = createContext<IncomingCallContextType | undefined>(undefined);

export function IncomingCallProvider({ children }: { children: ReactNode }) {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [showIncomingCallDialog, setShowIncomingCallDialog] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { user } = useAuth();
  const incomingCallRef = useRef(incomingCall);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const clearIncomingCall = useCallback(async (
    reason?: 'answered' | 'declined_by_user' | 'call_ended_by_other' | 'navigating_away',
    detailsForMissedCall?: { callType: 'audio' | 'video' | 'videosdk'; callerId: string; calleeId: string, chatId: string }
  ) => {
    const currentCallToClear = incomingCallRef.current; 
    if (reason === 'call_ended_by_other' && currentCallToClear && user && detailsForMissedCall) {
      await addMissedCallMessage(detailsForMissedCall.chatId, detailsForMissedCall.callType, detailsForMissedCall.callerId, detailsForMissedCall.calleeId);
    }
    setIncomingCall(null);
    setShowIncomingCallDialog(false);
  }, [user]);

  const presentIncomingCall = useCallback((callData: IncomingCallData) => {
    let onCallPage = false;
    const currentCall = incomingCallRef.current;

    if (callData.callType === 'videosdk') {
      onCallPage = pathname?.includes(`/videosdk-call`);
      if (onCallPage && currentCall && currentCall.callType === 'videosdk' && currentCall.videosdkMeetingId === callData.videosdkMeetingId) {
        return;
      }
    } else { 
      onCallPage = pathname?.includes(`/call/${callData.callType}/${callData.chatId}`);
    }

    if (onCallPage && callData.callType !== 'videosdk') {
        if (currentCall && currentCall.callDocId === callData.callDocId) {
            clearIncomingCall('navigating_away');
        }
        return;
    }
    setIncomingCall(callData);
    setShowIncomingCallDialog(true);
  }, [pathname, clearIncomingCall]);


  const answerCall = useCallback(async () => {
    const callToAnswer = incomingCallRef.current;
    if (!callToAnswer || !user) return; 
    const { callType, chatId, callDocId, videosdkMeetingId, caller } = callToAnswer;

    setShowIncomingCallDialog(false); // Hide dialog immediately

    if (callType === 'videosdk') {
      if (!videosdkMeetingId) {
        toast({title: "Error", description: "Meeting ID for VideoSDK call is missing.", variant: "destructive"});
        await deleteDoc(doc(db, "videoCallInvites", user.uid)).catch(e => console.error("Error deleting videoCallInvite:", e));
        clearIncomingCall('call_ended_by_other');
        return;
      }
      router.push(`/videosdk-call?meetingIdToJoin=${videosdkMeetingId}&callerName=${encodeURIComponent(caller.displayName || 'Caller')}&chatId=${chatId}`);
      try {
        // Update status after navigation attempt to ensure user experience is smooth
        await updateDoc(doc(db, "videoCallInvites", user.uid), { status: 'answered', updatedAt: serverTimestamp() });
      } catch (error) {
        console.error("Error updating videoCallInvite to answered:", error);
      }
    } else { // Firestore WebRTC call
      const roomDocRef = doc(db, "rooms", callDocId);
      const roomSnap = await getDoc(roomDocRef);
      if (!roomSnap.exists() || roomSnap.data()?.status !== 'ringing') {
          toast({ title: "Call Ended", description: "This call is no longer available.", variant: "destructive" });
          clearIncomingCall('call_ended_by_other', {
              chatId: callToAnswer.chatId,
              callType: callToAnswer.callType as 'audio' | 'video', 
              callerId: callToAnswer.caller.uid,
              calleeId: user.uid
          });
          return;
      }
      router.push(`/call/${callType}/${chatId}`);
    }
  }, [router, toast, user, clearIncomingCall]);

  const declineCall = useCallback(async () => {
    const callToDecline = incomingCallRef.current;
    if (!callToDecline || !user) return; 
    const { callDocId, chatId, callType, caller } = callToDecline;
    try {
      if (callType === 'videosdk') {
        await updateDoc(doc(db, "videoCallInvites", user.uid), { status: 'declined', updatedAt: serverTimestamp() });
        toast({ title: "Call Declined" });
        await addMissedCallMessage(chatId, 'videosdk', caller.uid, user.uid);
      } else { // Firestore WebRTC call
        const roomDocRef = doc(db, "rooms", callDocId);
        await updateDoc(roomDocRef, {
          status: "declined",
          updatedAt: serverTimestamp(),
        });
        toast({ title: "Call Declined" });
        await addMissedCallMessage(chatId, callType as 'audio' | 'video', caller.uid, user.uid);
      }
    } catch (error) {
      console.error("Error declining call:", error);
      toast({ title: "Error", description: "Could not decline call.", variant: "destructive" });
    }
    clearIncomingCall('declined_by_user');
  }, [toast, user, clearIncomingCall]);

  return (
    <IncomingCallContext.Provider
      value={{
        incomingCall,
        showIncomingCallDialog,
        presentIncomingCall,
        answerCall,
        declineCall,
        clearIncomingCall,
      }}
    >
      {children}
    </IncomingCallContext.Provider>
  );
}

export function useIncomingCall(): IncomingCallContextType {
  const context = useContext(IncomingCallContext);
  if (context === undefined) {
    throw new Error('useIncomingCall must be used within an IncomingCallProvider');
  }
  return context;
}
