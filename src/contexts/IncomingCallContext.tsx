
"use client";

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ChatUser } from '@/lib/chatActions'; 
import { addMissedCallMessage } from '@/lib/chatActions'; // Import the new function
import { useAuth } from '@/hooks/useAuth';

export interface IncomingCallData {
  chatId: string; // This is effectively the callDocId for 1-on-1
  caller: ChatUser; 
  callType: 'audio' | 'video';
  callDocId: string; 
}

interface IncomingCallContextType {
  incomingCall: IncomingCallData | null;
  showIncomingCallDialog: boolean;
  presentIncomingCall: (callData: IncomingCallData) => void;
  answerCall: () => void;
  declineCall: () => void;
  clearIncomingCall: (
    reason?: 'answered' | 'declined_by_user' | 'call_ended_by_other' | 'navigating_away',
    detailsForMissedCall?: { callType: 'audio' | 'video'; callerId: string; calleeId: string, chatId: string }
  ) => void;
}

const IncomingCallContext = createContext<IncomingCallContextType | undefined>(undefined);

export function IncomingCallProvider({ children }: { children: ReactNode }) {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [showIncomingCallDialog, setShowIncomingCallDialog] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth(); // Get current user from auth context

  const presentIncomingCall = useCallback((callData: IncomingCallData) => {
    // Prevent showing dialog if already in a call for this chat
    if (router.pathname?.includes(`/call/${callData.callType}/${callData.chatId}`)) {
        return;
    }
    setIncomingCall(callData);
    setShowIncomingCallDialog(true);
  }, [router.pathname]);

  const clearIncomingCall = useCallback(async (
    reason?: 'answered' | 'declined_by_user' | 'call_ended_by_other' | 'navigating_away',
    detailsForMissedCall?: { callType: 'audio' | 'video'; callerId: string; calleeId: string, chatId: string }
  ) => {
    if (reason === 'call_ended_by_other' && incomingCall && user && detailsForMissedCall) {
      // User (callee) missed the call because the other party ended/declined it while ringing
      // incomingCall.caller.uid is originalCallerId
      // user.uid is calleeWhoMissedId
      // incomingCall.chatId is the chatId
      await addMissedCallMessage(detailsForMissedCall.chatId, detailsForMissedCall.callType, detailsForMissedCall.callerId, detailsForMissedCall.calleeId);
    }
    setIncomingCall(null);
    setShowIncomingCallDialog(false);
  }, [incomingCall, user]);

  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    const { callType, chatId } = incomingCall;
    
    // Prevent multiple answer attempts or answering a non-existent call
    const callDocRef = doc(db, "calls", incomingCall.callDocId);
    const callSnap = await getDoc(callDocRef);
    if (!callSnap.exists() || callSnap.data()?.status !== 'ringing') {
        toast({ title: "Call Ended", description: "This call is no longer available.", variant: "destructive" });
        clearIncomingCall('call_ended_by_other', {
            chatId: incomingCall.chatId,
            callType: incomingCall.callType,
            callerId: incomingCall.caller.uid,
            calleeId: user?.uid || "unknown_callee"
        });
        return;
    }
    
    setShowIncomingCallDialog(false); // Hide dialog immediately
    router.push(`/call/${callType}/${chatId}`);
    // clearIncomingCall('answered'); // Cleared after navigation or if call page handles it. Better to clear from AppLayout listener.
  }, [incomingCall, router, toast, clearIncomingCall, user]);

  const declineCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    const { callDocId, chatId, callType, caller } = incomingCall;
    try {
      const callDocRef = doc(db, "calls", callDocId);
      await updateDoc(callDocRef, { status: "declined", updatedAt: new Date().toISOString(), offer: null, answer: null });
      toast({ title: "Call Declined" });
      // Log as missed call for the current user (callee) because they declined it.
      await addMissedCallMessage(chatId, callType, caller.uid, user.uid);
    } catch (error) {
      console.error("Error declining call:", error);
      toast({ title: "Error", description: "Could not decline call.", variant: "destructive" });
    }
    clearIncomingCall('declined_by_user');
  }, [incomingCall, toast, clearIncomingCall, user]);

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
