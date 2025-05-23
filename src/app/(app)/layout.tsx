
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
import { Logo } from '@/components/icons/Logo';
import { cn } from '@/lib/utils';

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

    const roomsQuery = query(
      collection(db, "rooms"),
      where("calleeId", "==", user.uid),
      where("status", "==", "ringing")
    );

    const unsubscribe = onSnapshot(roomsQuery, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const roomDocData = change.doc.data() as DocumentData & {
            callerId: string;
            calleeId: string;
            callType: 'audio' | 'video';
            status: string;
            offer?: any;
        };
        const roomDocId = change.doc.id;

        if (change.type === "added" || change.type === "modified") {
          if (roomDocData.status === 'ringing' && roomDocData.offer) {
            const onCallPage = pathname?.includes(`/call/${roomDocData.callType}/${roomDocId}`) || 
                               pathname?.includes(`/videocall?initialRoomId=${roomDocId}`);
            
            if (onCallPage) {
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
                const presentedCallData = incomingCall; 
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
         <div className="flex flex-col items-center space-y-4 p-8 rounded-lg shadow-xl bg-card w-full max-w-sm">
            <Logo className="h-10 w-auto text-primary mb-4" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full mt-2" />
        </div>
      </div>
    );
  }

  const isChatsPage = pathname?.startsWith('/chats');

  return (
    <SidebarProvider defaultOpen={true}> 
        <AppSidebar />
        <SidebarInset className={cn(
          "bg-background transition-all duration-300 ease-in-out",
        )}>
           <header className="sticky top-0 z-10 flex h-[var(--header-height)] items-center gap-4 border-b bg-card px-4 md:hidden shadow-sm">
              <SidebarTrigger className="text-foreground hover:bg-accent hover:text-accent-foreground" />
              <Logo className="h-7 w-auto text-primary" />
            </header>
          <main className={cn(
            "flex-1 overflow-auto",
             isChatsPage ? "h-[calc(100vh-var(--header-height))] md:h-screen" : "p-4 md:p-6 lg:p-8 h-full"
          )}>
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
