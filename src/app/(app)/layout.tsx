
"use client";

import type { ReactNode} from 'react';
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation"; // Import usePathname
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
  const pathname = usePathname(); // Get current pathname
  const { presentIncomingCall, incomingCall, clearIncomingCall } = useIncomingCall();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !presentIncomingCall || !clearIncomingCall) return;

    // Listen for calls where the current user is the callee.
    // We listen more broadly than just "ringing" to catch status changes that might indicate a missed call.
    const callsQuery = query(
      collection(db, "calls"),
      where("calleeId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(callsQuery, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const callDocData = change.doc.data() as DocumentData & { 
            callerId: string; 
            calleeId: string; 
            callType: 'audio' | 'video'; 
            status: string;
        };
        const callDocId = change.doc.id; // This is also the chatId for 1-on-1

        if (change.type === "added" || change.type === "modified") {
          if (callDocData.status === 'ringing') {
            // If already in a call screen for this chat, don't show dialog
            if (pathname?.includes(`/call/${callDocData.callType}/${callDocId}`)) {
                if (incomingCall && incomingCall.callDocId === callDocId) clearIncomingCall('navigating_away');
                return;
            }
            // Only present if not already showing this call, or if it's a new ringing call
            if (!incomingCall || incomingCall.callDocId !== callDocId) {
              const callerId = callDocData.callerId;
              if (callerId) {
                const userDocSnap = await getDoc(doc(db, "users", callerId));
                if (userDocSnap.exists()) {
                  const callerData = userDocSnap.data() as ChatUser;
                  presentIncomingCall({
                    chatId: callDocId, 
                    caller: {
                      uid: callerData.uid,
                      displayName: callerData.displayName || "Unknown Caller",
                      photoURL: callerData.photoURL,
                    },
                    callType: callDocData.callType as 'audio' | 'video',
                    callDocId: callDocId,
                  });
                }
              }
            }
          } else if (incomingCall && incomingCall.callDocId === callDocId) {
            // The call was ringing for us, but its status changed (e.g., ended, declined by caller)
            if (callDocData.status === 'ended' || callDocData.status === 'declined') {
              clearIncomingCall('call_ended_by_other', {
                  chatId: callDocId,
                  callType: callDocData.callType,
                  callerId: callDocData.callerId,
                  calleeId: user.uid
              });
            } else if (callDocData.status === 'answered' || callDocData.status === 'active') {
              // If it was answered/became active (possibly by this user on another device, or race condition)
              clearIncomingCall('answered');
            }
          }
        } else if (change.type === "removed") {
           if (incomingCall && incomingCall.callDocId === change.doc.id) {
            // Call document was removed while ringing for us, treat as missed.
            clearIncomingCall('call_ended_by_other', {
                chatId: incomingCall.chatId,
                callType: incomingCall.callType,
                callerId: incomingCall.caller.uid,
                calleeId: user.uid
            });
          }
        }
      });

      // After processing changes, check if the current incomingCall (if any) still exists and is ringing
      if (incomingCall) {
        const currentCallDocSnap = await getDoc(doc(db, "calls", incomingCall.callDocId));
        if (!currentCallDocSnap.exists() || 
            currentCallDocSnap.data()?.status !== 'ringing' || 
            currentCallDocSnap.data()?.calleeId !== user.uid) {
          // If the call being presented no longer exists or is not ringing for this user,
          // and it wasn't cleared by the docChanges loop (e.g. due to 'call_ended_by_other' already)
          // we need to make sure it's cleared. The reason here is more generic if not already handled.
          // This might be redundant if docChanges is comprehensive, but acts as a safeguard.
          if (currentCallDocSnap.data()?.status === 'ended' || currentCallDocSnap.data()?.status === 'declined'){
             clearIncomingCall('call_ended_by_other', {
                chatId: incomingCall.chatId,
                callType: incomingCall.callType,
                callerId: incomingCall.caller.uid,
                calleeId: user.uid
            });
          } else {
             clearIncomingCall(); // General clear if state is inconsistent
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
