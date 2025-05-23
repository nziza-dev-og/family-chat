
"use client";

import type { ReactNode} from 'react';
import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { IncomingCallProvider, useIncomingCall, type IncomingCallData as ContextIncomingCallData } from "@/contexts/IncomingCallContext"; // Ensure type is imported
import { IncomingCallDialog } from "@/components/IncomingCallDialog";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, getDoc, Timestamp, type DocumentData, Unsubscribe } from "firebase/firestore"; // Import Unsubscribe
import type { ChatUser } from '@/lib/chatActions';
// import type { IncomingCallData } from '@/contexts/IncomingCallContext'; // Already imported above as ContextIncomingCallData
import { Logo } from '@/components/icons/Logo';
import { cn } from '@/lib/utils';

interface VideoCallInvite {
  callerId: string;
  callerName: string;
  callerAvatar: string;
  meetingId: string;
  status: 'ringing' | 'answered' | 'declined' | 'ended';
  createdAt: Timestamp;
  chatId: string; 
  callType: 'videosdk';
}


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

    const unsubscribes: Unsubscribe[] = [];

    // Listener for Firestore WebRTC calls
    const roomsQuery = query(
      collection(db, "rooms"),
      where("calleeId", "==", user.uid),
      where("status", "==", "ringing")
    );

    const roomsUnsubscribe = onSnapshot(roomsQuery, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const roomDocData = change.doc.data() as DocumentData & {
            callerId: string;
            calleeId: string;
            callType: 'audio' | 'video';
            status: string;
            offer?: any;
        };
        const roomDocId = change.doc.id; // This is the chatId for rooms

        if (change.type === "added" || change.type === "modified") {
          if (roomDocData.status === 'ringing' && roomDocData.offer) {
            const onCallPage = pathname?.includes(`/call/${roomDocData.callType}/${roomDocId}`);
            
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
          } else if (incomingCall && incomingCall.callDocId === roomDocId && (incomingCall.callType === 'audio' || incomingCall.callType === 'video')) {
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
           if (incomingCall && incomingCall.callDocId === change.doc.id && (incomingCall.callType === 'audio' || incomingCall.callType === 'video')) {
            clearIncomingCall('call_ended_by_other', { 
                chatId: incomingCall.chatId,
                callType: incomingCall.callType,
                callerId: incomingCall.caller.uid, 
                calleeId: user.uid
            });
          }
        }
      });

      // Check if current presented WebRTC call is still valid
      if (incomingCall && (incomingCall.callType === 'audio' || incomingCall.callType === 'video')) {
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
                // Call is stale, clear it if it matches the presented call
                 if(incomingCall.callDocId === currentCallDocSnap.id){
                    console.log("Clearing stale incoming WebRTC call dialog for room:", incomingCall.callDocId);
                    clearIncomingCall();
                 }
            }
        }
      }
    });
    unsubscribes.push(roomsUnsubscribe);

    // Listener for VideoSDK invites
    const videoInviteDocRef = doc(db, "videoCallInvites", user.uid);
    const videoInviteUnsubscribe = onSnapshot(videoInviteDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const inviteData = docSnap.data() as VideoCallInvite;
            if (inviteData.status === 'ringing') {
                const onVideoSdkPage = pathname?.includes('/videosdk-call'); // Generic check for now
                
                if (onVideoSdkPage && incomingCall && incomingCall.callType === 'videosdk' && incomingCall.videosdkMeetingId === inviteData.meetingId) {
                   // Already on the page for this specific call, or dialog for this call is up.
                   // We might want to clear if dialog is for a *different* videosdk call.
                   // This logic might need refinement if multiple VideoSDK calls can ring.
                } else {
                    presentIncomingCall({
                        chatId: inviteData.chatId, // For missed call message context
                        caller: {
                            uid: inviteData.callerId,
                            displayName: inviteData.callerName,
                            photoURL: inviteData.callerAvatar,
                        },
                        callType: 'videosdk',
                        callDocId: docSnap.id, // Using invite doc id as callDocId for context
                        videosdkMeetingId: inviteData.meetingId,
                    });
                }
            } else if (incomingCall && incomingCall.callType === 'videosdk' && incomingCall.videosdkMeetingId === inviteData.meetingId) {
                // Invite status changed (answered, declined, ended) - clear dialog if it was for this call
                clearIncomingCall(inviteData.status === 'answered' ? 'answered' : 'call_ended_by_other', {
                    chatId: inviteData.chatId,
                    callType: 'videosdk',
                    callerId: inviteData.callerId,
                    calleeId: user.uid
                });
            }
        } else {
            // Invite document deleted, clear if it was the one being shown
            if (incomingCall && incomingCall.callType === 'videosdk' && incomingCall.callDocId === videoInviteDocRef.id) {
                clearIncomingCall('call_ended_by_other');
            }
        }
    });
    unsubscribes.push(videoInviteUnsubscribe);


    return () => {
        unsubscribes.forEach(unsub => unsub());
    };
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
           <header className="sticky top-0 z-10 flex h-[var(--header-height)] items-center gap-4 border-b bg-primary text-primary-foreground px-4 md:hidden shadow-sm">
              <SidebarTrigger className="text-primary-foreground hover:bg-primary/80" />
              <Logo className="h-7 w-auto text-primary-foreground" />
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
    // IncomingCallProvider is already wrapping AuthProvider's children in RootLayout
    <AppContent>{children}</AppContent>
  );
}

