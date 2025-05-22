
"use client";

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation'; // usePathname
import { db } from '@/lib/firebase'; // Removed auth, not directly used here
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ChatUser } from '@/lib/chatActions'; 
import { addMissedCallMessage } from '@/lib/chatActions';
import { useAuth } from '@/hooks/useAuth';

export interface IncomingCallData {
  chatId: string; // This is effectively the roomId for 1-on-1
  caller: ChatUser; 
  callType: 'audio' | 'video';
  callDocId: string; // Same as chatId for this structure
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
  const pathname = usePathname();
  const { toast } = useToast();
  const { user } = useAuth();

  const presentIncomingCall = useCallback((callData: IncomingCallData) => {
    // Prevent showing dialog if already in a call screen for this chat
    if (pathname?.includes(`/call/${callData.callType}/${callData.chatId}`)) {
        return;
    }
    setIncomingCall(callData);
    setShowIncomingCallDialog(true);
  }, [pathname]);

  const clearIncomingCall = useCallback(async (
    reason?: 'answered' | 'declined_by_user' | 'call_ended_by_other' | 'navigating_away',
    detailsForMissedCall?: { callType: 'audio' | 'video'; callerId: string; calleeId: string, chatId: string }
  ) => {
    if (reason === 'call_ended_by_other' && incomingCall && user && detailsForMissedCall) {
      await addMissedCallMessage(detailsForMissedCall.chatId, detailsForMissedCall.callType, detailsForMissedCall.callerId, detailsForMissedCall.calleeId);
    }
    setIncomingCall(null);
    setShowIncomingCallDialog(false);
  }, [incomingCall, user]);

  const answerCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    const { callType, chatId, callDocId } = incomingCall;
    
    const roomDocRef = doc(db, "rooms", callDocId); // Using 'rooms' collection
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
    
    setShowIncomingCallDialog(false); 
    router.push(`/call/${callType}/${chatId}`);
    // clearIncomingCall('answered'); // Let AppLayout handle clearing based on navigation or call status
  }, [incomingCall, router, toast, clearIncomingCall, user]);

  const declineCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    const { callDocId, chatId, callType, caller } = incomingCall;
    try {
      const roomDocRef = doc(db, "rooms", callDocId); // Using 'rooms' collection
      await updateDoc(roomDocRef, { 
        status: "declined", 
        updatedAt: serverTimestamp(), 
        // Offer and answer might not be cleared here, as room doc might be deleted later by caller
      });
      toast({ title: "Call Declined" });
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
