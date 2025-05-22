
"use client";

import VideoCall from '@/components/VideoCall';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function VideoCallPageContent() {
  const searchParams = useSearchParams();
  const initialRoomId = searchParams.get('initialRoomId');

  // No longer fetching /api/socket as we are using an external signaling server
  // useEffect(() => {
  //   fetch('/api/socket').catch(error => {
  //     console.warn("Attempt to warm up socket API route failed. This is often fine if socket connects otherwise.", error);
  //   });
  // }, []);

  return <VideoCall initialRoomId={initialRoomId} />;
}


export default function VideoCallPage() {
    return (
        <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /> <p className="ml-3">Loading call interface...</p></div>}>
            <VideoCallPageContent />
        </Suspense>
    )
}
