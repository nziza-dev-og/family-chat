
"use client";

import type { ReactNode} from 'react';
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation"; 
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { IncomingCallProvider, useIncomingCall } from "@/contexts/IncomingCallContext";
import { IncomingCallDialog } from "@/components/IncomingCallDialog";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp, type DocumentData } from "firebase/firestore";
import type { ChatUser } from '@/lib/chatActions';
import type { IncomingCallData } from '@/contexts/IncomingCallContext';

function AppContent({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); 
  const { presentIncomingCall, incomingCall, clearIncomingCall } = useIncomingCall();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !presentIncomingCall || !clearIncomingCall) return;

    // Listen for calls where the current user is the callee.
    const roomsQuery = query(
      collection(db, "rooms"), // Listen to 'rooms' collection
      where("calleeId", "==", user.uid),
      // where("status", "==", "ringing") // Initial filter, but also need to handle changes
    );

    const unsubscribe = onSnapshot(roomsQuery, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const roomDocData = change.doc.data() as DocumentData & { 
            callerId: string; 
            calleeId: string; 
            callType: 'audio' | 'video'; 
            status: string;
            offer?: any; // Offer should exist for ringing
        };
        const roomDocId = change.doc.id; // This is also the chatId for 1-on-1

        if (change.type === "added" || change.type === "modified") {
          if (roomDocData.status === 'ringing' && roomDocData.offer) {
            if (pathname?.includes(`/call/${roomDocData.callType}/${roomDocId}`)) {
                if (incomingCall && incomingCall.callDocId === roomDocId) clearIncomingCall('navigating_away');
                return;
            }
            if (!incomingCall || incomingCall.callDocId !== roomDocId) {
              const callerId = roomDocData.callerId;
              if (callerId) {
                const userDocSnap = await getDoc(doc(db, "users", callerId));
                if (userDocSnap.exists()) {
                  const callerData = userDocSnap.data() as ChatUser;
                  presentIncomingCall({
                    chatId: roomDocId, 
                    caller: {
                      uid: callerData.uid,
                      displayName: callerData.displayName || "Unknown Caller",
                      photoURL: callerData.photoURL,
                    },
                    callType: roomDocData.callType as 'audio' | 'video',
                    callDocId: roomDocId,
                  });
                }
              }
            }
          } else if (incomingCall && incomingCall.callDocId === roomDocId) {
            if (roomDocData.status === 'ended' || roomDocData.status === 'declined') {
              clearIncomingCall('call_ended_by_other', {
                  chatId: roomDocId,
                  callType: roomDocData.callType,
                  callerId: roomDocData.callerId,
                  calleeId: user.uid
              });
            } else if (roomDocData.status === 'answered' || roomDocData.status === 'active') {
              clearIncomingCall('answered');
            }
          }
        } else if (change.type === "removed") {
           if (incomingCall && incomingCall.callDocId === change.doc.id) {
            clearIncomingCall('call_ended_by_other', {
                chatId: incomingCall.chatId,
                callType: incomingCall.callType,
                callerId: incomingCall.caller.uid,
                calleeId: user.uid
            });
          }
        }
      });

      if (incomingCall) {
        const currentCallDocSnap = await getDoc(doc(db, "rooms", incomingCall.callDocId));
        if (!currentCallDocSnap.exists() || 
            currentCallDocSnap.data()?.status !== 'ringing' || 
            currentCallDocSnap.data()?.calleeId !== user.uid) {
            if (currentCallDocSnap.data()?.status === 'ended' || currentCallDocSnap.data()?.status === 'declined'){
                clearIncomingCall('call_ended_by_other', {
                    chatId: incomingCall.chatId,
                    callType: incomingCall.callType,
                    callerId: incomingCall.caller.uid,
                    calleeId: user.uid
                });
            } else if (currentCallDocSnap.data()?.status === 'answered' || currentCallDocSnap.data()?.status === 'active') {
                clearIncomingCall('answered');
            } else {
                // If the call is no longer ringing for this user for other reasons, clear the dialog.
                // This is a safeguard against the dialog sticking if the document state becomes inconsistent
                // with an active ringing presentation.
                const presentedCallData = incomingCall; // copy to avoid race condition if incomingCall changes during async
                if(presentedCallData && presentedCallData.callDocId === currentCallDocSnap.id){
                    console.log("Clearing stale incoming call dialog for room:", presentedCallData.callDocId);
                    clearIncomingCall(); 
                }
            }
        }
      }
    });

    return () => unsubscribe();
  }, [user, presentIncomingCall, clearIncomingCall, incomingCall, pathname]);


  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
         <div className="flex items-center space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
            </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen>
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-4 md:hidden">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">FamilyChat</h1>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </SidebarInset>
        <IncomingCallDialog />
    </SidebarProvider>
  );
}


export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <IncomingCallProvider>
      <AppContent>{children}</AppContent>
    </IncomingCallProvider>
  );
}
