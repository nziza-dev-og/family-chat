
"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useIncomingCall } from "@/contexts/IncomingCallContext";
import { Phone, Video, X } from "lucide-react";

export function IncomingCallDialog() {
  const { incomingCall, showIncomingCallDialog, answerCall, declineCall, clearIncomingCall } = useIncomingCall();

  if (!showIncomingCallDialog || !incomingCall) {
    return null;
  }

  const { caller, callType } = incomingCall;
  let callTypeDisplay = callType;
  if (callType === 'videosdk') callTypeDisplay = 'video'; // For UI display

  return (
    <AlertDialog open={showIncomingCallDialog} onOpenChange={(open) => { if(!open) clearIncomingCall(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Avatar className="h-24 w-24 border-4 border-primary">
              <AvatarImage src={caller.photoURL || undefined} alt={caller.displayName || "Caller"} data-ai-hint="person portrait" />
              <AvatarFallback className="text-3xl">{caller.displayName?.substring(0,1) || "C"}</AvatarFallback>
            </Avatar>
          </div>
          <AlertDialogTitle className="text-xl">Incoming {callTypeDisplay} call</AlertDialogTitle>
          <AlertDialogDescription className="text-lg">
            {caller.displayName || "Someone"} is calling...
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="grid grid-cols-2 gap-4 pt-4">
          <Button
            variant="destructive"
            className="w-full rounded-full p-6 text-lg"
            onClick={declineCall}
            aria-label="Decline call"
          >
            <X className="mr-2 h-6 w-6" /> Decline
          </Button>
          <Button
            variant="default"
            className="w-full rounded-full p-6 text-lg bg-green-500 hover:bg-green-600 text-white"
            onClick={answerCall}
            aria-label="Answer call"
          >
            {callTypeDisplay === 'video' ? <Video className="mr-2 h-6 w-6" /> : <Phone className="mr-2 h-6 w-6" />}
            Answer
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
