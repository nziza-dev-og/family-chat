
"use client";

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
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
  callType: 'audio' | 'video' | 'videosdk'; // Added videosdk
  callDocId: string; // Firestore doc ID for custom WebRTC calls
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

  const presentIncomingCall = useCallback((callData: IncomingCallData) => {
    let onCallPage = false;
    if (callData.callType === 'videosdk') {
      onCallPage = pathname?.includes(`/videosdk-call`); // Simpler check for videosdk
    } else {
      onCallPage = pathname?.includes(`/call/${callData.callType}/${callData.chatId}`);
    }
    
    if (onCallPage && callData.callType !== 'videosdk') { // For non-videosdk, if on call page, don't show dialog
        if (incomingCall && incomingCall.callDocId === callData.callDocId) clearIncomingCall('navigating_away');
        return;
    }
    // Allow showing dialog for VideoSDK even if on the generic /videosdk-call page,
    // because user might be there but not in the specific meeting.
    setIncomingCall(callData);
    setShowIncomingCallDialog(true);
  }, [pathname, incomingCall, clearIncomingCall]); // Added incomingCall and clearIncomingCall to deps

  const clearIncomingCall = useCallback(async (
    reason?: 'answered' | 'declined_by_user' | 'call_ended_by_other' | 'navigating_away',
    detailsForMissedCall?: { callType: 'audio' | 'video' | 'videosdk'; callerId: string; calleeId: string, chatId: string }
  ) => {
    if (reason === 'call_ended_by_other' && incomingCall && user && detailsForMissedCall) {
      await addMissedCallMessage(detailsForMissedCall.chatId, detailsForMissedCall.callType, detailsForMissedCall.callerId, detailsForMissedCall.calleeId);
    }
    setIncomingCall(null);
    setShowIncomingCallDialog(false);
  }, [incomingCall, user]); // Added incomingCall and user to deps

  const answerCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    const { callType, chatId, callDocId, videosdkMeetingId, caller } = incomingCall;
    
    setShowIncomingCallDialog(false); 

    if (callType === 'videosdk') {
      if (!videosdkMeetingId) {
        toast({title: "Error", description: "Meeting ID for VideoSDK call is missing.", variant: "destructive"});
        await deleteDoc(doc(db, "videoCallInvites", user.uid)).catch(e => console.error("Error deleting videoCallInvite:", e));
        clearIncomingCall('call_ended_by_other');
        return;
      }
      router.push(`/videosdk-call?meetingIdToJoin=${videosdkMeetingId}&callerName=${encodeURIComponent(caller.displayName || 'Caller')}&chatId=${chatId}`);
      // Mark invite as answered
      try {
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
              chatId: incomingCall.chatId,
              callType: incomingCall.callType,
              callerId: incomingCall.caller.uid,
              calleeId: user.uid 
          });
          return;
      }
      router.push(`/call/${callType}/${chatId}`);
    }
    // Don't call clearIncomingCall immediately; let AppLayout handle it based on navigation or status change.
  }, [incomingCall, router, toast, user, clearIncomingCall]); // Added clearIncomingCall and user

  const declineCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    const { callDocId, chatId, callType, caller, videosdkMeetingId } = incomingCall;
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
        await addMissedCallMessage(chatId, callType, caller.uid, user.uid);
      }
    } catch (error) {
      console.error("Error declining call:", error);
      toast({ title: "Error", description: "Could not decline call.", variant: "destructive" });
    }
    clearIncomingCall('declined_by_user');
  }, [incomingCall, toast, user, clearIncomingCall]); // Added user and clearIncomingCall

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
