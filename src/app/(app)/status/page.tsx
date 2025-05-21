
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Edit3, Loader2, Plus, FileImage, AlignLeft } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useRef, type ChangeEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { addTextStatus, addImageStatus, getStatusesForUserList, type UserStatusGroup, type StatusDisplay } from "@/lib/statusActions";
import { getFriends, type ChatUser } from "@/lib/chatActions"; // To get friend UIDs
import { ScrollArea } from "@/components/ui/scroll-area";

export default function StatusPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [myStatusGroups, setMyStatusGroups] = useState<UserStatusGroup[]>([]);
  const [friendsStatusGroups, setFriendsStatusGroups] = useState<UserStatusGroup[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const [isTextStatusModalOpen, setIsTextStatusModalOpen] = useState(false);
  const [isImageStatusModalOpen, setIsImageStatusModalOpen] = useState(false);
  const [newTextStatus, setNewTextStatus] = useState("");
  const [selectedStatusFile, setSelectedStatusFile] = useState<File | null>(null);
  const statusFileInputRef = useRef<HTMLInputElement>(null);
  const [isPostingStatus, setIsPostingStatus] = useState(false);

  const [viewingStatus, setViewingStatus] = useState<UserStatusGroup | null>(null);
  const [currentStatusIndex, setCurrentStatusIndex] = useState(0);


  useEffect(() => {
    if (user && !authLoading) {
      const fetchAllStatuses = async () => {
        setIsLoadingStatus(true);
        try {
          const friendsList = await getFriends(user.uid);
          const friendUIDs = friendsList.map(f => f.uid);
          const allUIDs = [user.uid, ...friendUIDs];
          
          const fetchedStatusGroups = await getStatusesForUserList(allUIDs);
          
          const myGroups = fetchedStatusGroups.filter(group => group.userId === user.uid);
          const othersGroups = fetchedStatusGroups.filter(group => group.userId !== user.uid);

          setMyStatusGroups(myGroups);
          setFriendsStatusGroups(othersGroups);

        } catch (error) {
          console.error("Failed to fetch statuses:", error);
          toast({ title: "Error", description: "Could not load statuses.", variant: "destructive" });
        } finally {
          setIsLoadingStatus(false);
        }
      };
      fetchAllStatuses();
    }
  }, [user, authLoading, toast]);

  const handlePostTextStatus = async () => {
    if (!user || !newTextStatus.trim()) return;
    setIsPostingStatus(true);
    try {
      await addTextStatus(user.uid, newTextStatus.trim());
      toast({ title: "Success", description: "Status posted." });
      setIsTextStatusModalOpen(false);
      setNewTextStatus("");
      // Refresh statuses
      const friendsList = await getFriends(user.uid);
      const friendUIDs = friendsList.map(f => f.uid);
      const allUIDs = [user.uid, ...friendUIDs];
      const updatedStatuses = await getStatusesForUserList(allUIDs);
      setMyStatusGroups(updatedStatuses.filter(group => group.userId === user.uid));
      setFriendsStatusGroups(updatedStatuses.filter(group => group.userId !== user.uid));

    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to post status.", variant: "destructive" });
    } finally {
      setIsPostingStatus(false);
    }
  };

  const handleStatusFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedStatusFile(event.target.files[0]);
    }
  };

  const handlePostImageStatus = async () => {
    if (!user || !selectedStatusFile) return;
    setIsPostingStatus(true);
    try {
      await addImageStatus(user.uid, selectedStatusFile);
      toast({ title: "Success", description: "Status posted." });
      setIsImageStatusModalOpen(false);
      setSelectedStatusFile(null);
      if(statusFileInputRef.current) statusFileInputRef.current.value = "";
       // Refresh statuses
      const friendsList = await getFriends(user.uid);
      const friendUIDs = friendsList.map(f => f.uid);
      const allUIDs = [user.uid, ...friendUIDs];
      const updatedStatuses = await getStatusesForUserList(allUIDs);
      setMyStatusGroups(updatedStatuses.filter(group => group.userId === user.uid));
      setFriendsStatusGroups(updatedStatuses.filter(group => group.userId !== user.uid));
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to post image status.", variant: "destructive" });
    } finally {
      setIsPostingStatus(false);
    }
  };

  const openStatusViewer = (group: UserStatusGroup) => {
    setViewingStatus(group);
    setCurrentStatusIndex(0);
  };

  const closeStatusViewer = () => {
    setViewingStatus(null);
  };

  const nextStatus = () => {
    if (viewingStatus && currentStatusIndex < viewingStatus.statuses.length - 1) {
      setCurrentStatusIndex(prev => prev + 1);
    } else {
      closeStatusViewer(); // Close if it's the last status
    }
  };

  const prevStatus = () => {
    if (viewingStatus && currentStatusIndex > 0) {
      setCurrentStatusIndex(prev => prev - 1);
    }
  };


  const myCurrentStatus = myStatusGroups.length > 0 ? myStatusGroups[0] : null;
  const viewedUpdates = friendsStatusGroups.filter(group => group.statuses.some(s => false)); // Placeholder for viewed logic
  const recentUpdates = friendsStatusGroups.filter(group => !viewedUpdates.find(vg => vg.userId === group.userId));


  if (authLoading || !user) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading...</p></div>;
  }

  return (
    <div className="flex flex-col h-full">
      <CardHeader className="px-0 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Status</CardTitle>
        </div>
      </CardHeader>

      {isLoadingStatus ? (
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="flex-1 -mx-4 sm:-mx-6 lg:-mx-8">
          {/* My Status */}
          <Card 
            className="mb-2 shadow-none border-0 rounded-none hover:bg-secondary/50 cursor-pointer"
            onClick={() => myCurrentStatus && openStatusViewer(myCurrentStatus)}
          >
            <CardContent className="p-3 flex items-center space-x-3">
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.photoURL || undefined} alt="My Status" data-ai-hint="person portrait" />
                  <AvatarFallback>{user.displayName?.substring(0,1) || "U"}</AvatarFallback>
                </Avatar>
                {!myCurrentStatus && (
                  <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background">
                    <Plus className="h-3 w-3" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold">My Status</p>
                <p className="text-sm text-muted-foreground">
                  {myCurrentStatus ? `${myCurrentStatus.statuses.length} update${myCurrentStatus.statuses.length > 1 ? 's' : ''} \u00B7 ${myCurrentStatus.lastStatusTime}` : "Tap to add status update"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recent Updates */}
          {recentUpdates.length > 0 && (
            <div className="py-2">
              <h3 className="px-3 text-sm font-medium text-muted-foreground mb-1">Recent updates</h3>
              {recentUpdates.map((group) => (
                <Card key={group.userId} 
                  className="mb-1 shadow-none border-0 rounded-none hover:bg-secondary/50 cursor-pointer"
                  onClick={() => openStatusViewer(group)}
                >
                  <CardContent className="p-3 flex items-center space-x-3">
                    <Avatar className="h-12 w-12 border-2 border-primary">
                      <AvatarImage src={group.userAvatar || undefined} alt={group.userName || "User"} data-ai-hint={group.dataAiHint || "person"} />
                      <AvatarFallback>{group.userName?.substring(0,1) || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{group.userName}</p>
                      <p className="text-sm text-muted-foreground">{group.lastStatusTime}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {/* Viewed Updates - can be implemented later */}
        </ScrollArea>
      )}
      
      {/* Floating Action Buttons */}
      <div className="fixed bottom-20 right-6 md:bottom-6 md:right-6 z-20 flex flex-col space-y-3">
        <Dialog open={isTextStatusModalOpen} onOpenChange={setIsTextStatusModalOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full h-12 w-12 shadow-lg bg-muted hover:bg-muted/80">
                    <AlignLeft className="h-5 w-5 text-foreground" />
                    <span className="sr-only">New text status</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Add Text Status</DialogTitle></DialogHeader>
                <Textarea 
                    placeholder="What's on your mind?" 
                    value={newTextStatus}
                    onChange={(e) => setNewTextStatus(e.target.value)}
                    rows={5}
                    className="my-4"
                />
                <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handlePostTextStatus} disabled={isPostingStatus || !newTextStatus.trim()}>
                        {isPostingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Post
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog open={isImageStatusModalOpen} onOpenChange={setIsImageStatusModalOpen}>
            <DialogTrigger asChild>
                <Button size="icon" className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90">
                    <Camera className="h-6 w-6 text-primary-foreground" />
                    <span className="sr-only">New photo/video status</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Add Image Status</DialogTitle></DialogHeader>
                <div className="my-4">
                    <Input type="file" accept="image/*" onChange={handleStatusFileChange} ref={statusFileInputRef} />
                    {selectedStatusFile && <p className="text-sm text-muted-foreground mt-2">Selected: {selectedStatusFile.name}</p>}
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button variant="outline" onClick={() => setSelectedStatusFile(null)}>Cancel</Button></DialogClose>
                    <Button onClick={handlePostImageStatus} disabled={isPostingStatus || !selectedStatusFile}>
                        {isPostingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Post
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>

      {/* Status Viewer Modal */}
      {viewingStatus && viewingStatus.statuses.length > 0 && (
        <div 
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
            onClick={nextStatus} // Click anywhere on backdrop to go to next or close
        >
            <div className="absolute top-4 left-4 flex items-center space-x-2 z-10">
                <Avatar className="h-8 w-8 border-2 border-white">
                    <AvatarImage src={viewingStatus.userAvatar || undefined} />
                    <AvatarFallback>{viewingStatus.userName?.substring(0,1)}</AvatarFallback>
                </Avatar>
                <div>
                    <p className="text-white font-semibold">{viewingStatus.userName}</p>
                    <p className="text-xs text-gray-300">{formatStatusTimestamp(viewingStatus.statuses[currentStatusIndex].createdAt.toDate())}</p>
                </div>
            </div>
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 z-10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); closeStatusViewer(); }}>
                <X className="h-6 w-6"/>
            </Button>
            
            {/* Progress bars for multiple statuses */}
            {viewingStatus.statuses.length > 1 && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[90%] max-w-md flex space-x-1 z-10 px-4">
                {viewingStatus.statuses.map((_, idx) => (
                  <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full">
                    <div 
                      className={`h-full rounded-full ${idx <= currentStatusIndex ? 'bg-white' : ''}`}
                      style={{ width: idx === currentStatusIndex ? '100%' : (idx < currentStatusIndex ? '100%' : '0%') }} // Simplified progress
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="relative max-w-full max-h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {viewingStatus.statuses[currentStatusIndex].type === 'image' ? (
                    <Image 
                        src={viewingStatus.statuses[currentStatusIndex].content} 
                        alt="Status image" 
                        layout="intrinsic"
                        width={800} // Adjust as needed, aspect ratio will be maintained
                        height={800} // Adjust as needed
                        objectFit="contain"
                        className="rounded-lg"
                        data-ai-hint={viewingStatus.statuses[currentStatusIndex].dataAiHint || "status image"}
                    />
                ) : (
                    <div className="bg-primary p-8 rounded-lg text-center max-w-md">
                        <p className="text-2xl text-primary-foreground whitespace-pre-wrap">
                            {viewingStatus.statuses[currentStatusIndex].content}
                        </p>
                    </div>
                )}
            </div>

            {/* Navigation for multi-status (optional, click on sides) */}
            {viewingStatus.statuses.length > 1 && (
                 <>
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-full w-1/3 cursor-pointer z-10" onClick={(e) => { e.stopPropagation(); prevStatus(); }}/>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 h-full w-1/3 cursor-pointer z-10" onClick={(e) => { e.stopPropagation(); nextStatus(); }}/>
                 </>
            )}
        </div>
      )}

    </div>
  );
}

