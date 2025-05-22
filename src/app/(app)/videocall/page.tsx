
"use client";

import VideoCall from '@/components/VideoCall';
import { useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';

function VideoCallPageContent() {
  const searchParams = useSearchParams();
  const initialRoomId = searchParams.get('initialRoomId');

  useEffect(() => {
    // This fetch is a common pattern to "warm up" or ensure the Next.js API route 
    // (which initializes the Socket.IO server) is running.
    // It doesn't need to do anything with the response.
    fetch('/api/socket').catch(error => {
      console.warn("Attempt to warm up socket API route failed. This is often fine if socket connects otherwise.", error);
    });
  }, []);

  return <VideoCall initialRoomId={initialRoomId} />;
}


export default function VideoCallPage() {
    return (
        <Suspense fallback={<div>Loading call details...</div>}>
            <VideoCallPageContent />
        </Suspense>
    )
}
