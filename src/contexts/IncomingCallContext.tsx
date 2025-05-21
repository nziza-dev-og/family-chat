
"use client";

import type { ReactNode} from 'react';
import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { ChatUser } from '@/lib/chatActions'; // Assuming ChatUser is defined here

export interface IncomingCallData {
  chatId: string;
  caller: ChatUser; // User who is calling
  callType: 'audio' | 'video';
  callDocId: string; // This is typically the same as chatId for 1-on-1
}

interface IncomingCallContextType {
  incomingCall: IncomingCallData | null;
  showIncomingCallDialog: boolean;
  presentIncomingCall: (callData: IncomingCallData) => void;
  answerCall: () => void;
  declineCall: () => void;
  clearIncomingCall: () => void;
}

const IncomingCallContext = createContext<IncomingCallContextType | undefined>(undefined);

export function IncomingCallProvider({ children }: { children: ReactNode }) {
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [showIncomingCallDialog, setShowIncomingCallDialog] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const presentIncomingCall = useCallback((callData: IncomingCallData) => {
    setIncomingCall(callData);
    setShowIncomingCallDialog(true);
  }, []);

  const clearIncomingCall = useCallback(() => {
    setIncomingCall(null);
    setShowIncomingCallDialog(false);
  }, []);

  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    const { callType, chatId, callDocId } = incomingCall;
    
    // Optionally update status to 'answered' immediately,
    // or let the call page handle it once connection starts.
    // For now, let call page handle status updates post-navigation.
    // try {
    //   await updateDoc(doc(db, "calls", callDocId), { status: "answered", updatedAt: new Date().toISOString() });
    // } catch (error) {
    //   console.error("Error updating call status to answered:", error);
    // }

    setShowIncomingCallDialog(false);
    router.push(`/call/${callType}/${chatId}`);
    // setIncomingCall(null); // Clear after navigation or let AppLayout handle it if listener logic changes
  }, [incomingCall, router]);

  const declineCall = useCallback(async () => {
    if (!incomingCall) return;
    const { callDocId } = incomingCall;
    try {
      const callDocRef = doc(db, "calls", callDocId);
      await updateDoc(callDocRef, { status: "declined", updatedAt: new Date().toISOString(), offer: null, answer: null }); // Clear offer/answer
      toast({ title: "Call Declined" });
    } catch (error) {
      console.error("Error declining call:", error);
      toast({ title: "Error", description: "Could not decline call.", variant: "destructive" });
    }
    clearIncomingCall();
  }, [incomingCall, toast, clearIncomingCall]);

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
