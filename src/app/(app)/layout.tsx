
"use client";

import type { ReactNode} from 'react';
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { IncomingCallProvider, useIncomingCall } from "@/contexts/IncomingCallContext";
import { IncomingCallDialog } from "@/components/IncomingCallDialog";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp } from "firebase/firestore";
import type { ChatUser } from '@/lib/chatActions';
import type { IncomingCallData } from '@/contexts/IncomingCallContext';

function AppContent({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { presentIncomingCall, incomingCall, clearIncomingCall } = useIncomingCall();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !presentIncomingCall || !clearIncomingCall) return;

    const callsQuery = query(
      collection(db, "calls"),
      where("calleeId", "==", user.uid),
      where("status", "==", "ringing")
    );

    const unsubscribe = onSnapshot(callsQuery, async (snapshot) => {
      if (snapshot.empty && incomingCall) {
        // If current incoming call doc no longer matches query (e.g. status changed), clear it
         const currentCallDocSnap = await getDoc(doc(db, "calls", incomingCall.callDocId));
         if (!currentCallDocSnap.exists() || currentCallDocSnap.data()?.status !== 'ringing' || currentCallDocSnap.data()?.calleeId !== user.uid) {
            clearIncomingCall();
         }
      }
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added" || change.type === "modified") {
          const callDocData = change.doc.data();
          const callDocId = change.doc.id;

          // Check if this call is already being presented to avoid duplicates
          if (incomingCall && incomingCall.callDocId === callDocId) {
            // If current incoming call status changes from ringing, clear it
            if (callDocData.status !== 'ringing') {
              clearIncomingCall();
            }
            return;
          }
          
          // Only present if not already showing an incoming call
          if (!incomingCall && callDocData.status === 'ringing') {
            const callerId = callDocData.callerId;
            if (callerId) {
              const userDocSnap = await getDoc(doc(db, "users", callerId));
              if (userDocSnap.exists()) {
                const callerData = userDocSnap.data() as ChatUser;
                presentIncomingCall({
                  chatId: callDocId, // Assuming chatId is the callDocId for 1-on-1
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
        } else if (change.type === "removed") {
           if (incomingCall && incomingCall.callDocId === change.doc.id) {
            clearIncomingCall();
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user, presentIncomingCall, clearIncomingCall, incomingCall]);


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
