
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Edit3, Loader2, Plus, FileImage, AlignLeft, X, Link as LinkIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useRef, type ChangeEvent } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { addTextStatus, addMediaStatus, getStatusesForUserList, type UserStatusGroup, type StatusDisplay, formatStatusTimestamp } from "@/lib/statusActions";
import { getFriends, type ChatUser } from "@/lib/chatActions"; 
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

export default function StatusPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [myStatusGroups, setMyStatusGroups] = useState<UserStatusGroup[]>([]);
  const [friendsStatusGroups, setFriendsStatusGroups] = useState<UserStatusGroup[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const [isTextStatusModalOpen, setIsTextStatusModalOpen] = useState(false);
  const [isMediaStatusModalOpen, setIsMediaStatusModalOpen] = useState(false);
  const [newTextStatus, setNewTextStatus] = useState("");
  const [statusMediaCaption, setStatusMediaCaption] = useState("");
  const [selectedStatusFile, setSelectedStatusFile] = useState<File | null>(null);
  const [selectedMediaType, setSelectedMediaType] = useState<'image' | 'video' | null>(null);
  const [statusMediaUrlInput, setStatusMediaUrlInput] = useState("");
  const [activeMediaTab, setActiveMediaTab] = useState<'upload' | 'url'>("upload");
  
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
          const allUIDs = Array.from(new Set([user.uid, ...friendUIDs])); 
          
          const fetchedStatusGroups = await getStatusesForUserList(allUIDs);
          
          const myGroups = fetchedStatusGroups.filter(group => group.userId === user.uid);
          const othersGroups = fetchedStatusGroups.filter(group => group.userId !== user.uid);

          setMyStatusGroups(myGroups);
          setFriendsStatusGroups(othersGroups);

        } catch (error: any) {
          console.error("Failed to fetch statuses:", error);
          if (error.message?.includes("index") || error.code?.includes("failed-precondition")) {
             toast({ 
              title: "Firestore Index Required", 
              description: "A Firestore index is needed for status queries. Please create it in your Firebase console. The exact index details should be in your browser's console log or the error message.", 
              variant: "destructive",
              duration: 10000 
            });
          } else {
            toast({ title: "Error", description: "Could not load statuses.", variant: "destructive" });
          }
        } finally {
          setIsLoadingStatus(false);
        }
      };
      fetchAllStatuses();
    }
  }, [user, authLoading, toast]);

  const refreshStatuses = async () => {
    if(!user) return;
    setIsLoadingStatus(true); 
    try {
        const friendsList = await getFriends(user.uid);
        const friendUIDs = friendsList.map(f => f.uid);
        const allUIDs = Array.from(new Set([user.uid, ...friendUIDs]));
        const updatedStatuses = await getStatusesForUserList(allUIDs);
        setMyStatusGroups(updatedStatuses.filter(group => group.userId === user.uid));
        setFriendsStatusGroups(updatedStatuses.filter(group => group.userId !== user.uid));
    } catch (error: any) {
        console.error("Failed to refresh statuses:", error);
        toast({ title: "Error", description: "Could not refresh statuses.", variant: "destructive" });
    } finally {
        setIsLoadingStatus(false);
    }
  }

  const handlePostTextStatus = async () => {
    if (!user || !newTextStatus.trim()) return;
    setIsPostingStatus(true);
    try {
      await addTextStatus(user.uid, newTextStatus.trim());
      toast({ title: "Success", description: "Status posted." });
      setIsTextStatusModalOpen(false);
      setNewTextStatus("");
      await refreshStatuses();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to post status.", variant: "destructive" });
    } finally {
      setIsPostingStatus(false);
    }
  };

  const handleStatusFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setSelectedStatusFile(file);
      if (file.type.startsWith('image/')) {
        setSelectedMediaType('image');
      } else if (file.type.startsWith('video/')) {
        setSelectedMediaType('video');
      } else {
        setSelectedMediaType(null); 
        toast({title: "Unsupported File", description: "Please select an image or video file.", variant: "destructive"});
        setSelectedStatusFile(null); 
        if(statusFileInputRef.current) statusFileInputRef.current.value = "";
      }
    }
  };

  const handlePostMediaStatus = async () => {
    if (!user) return;
    
    let mediaToPost: File | string | null = null;
    let finalMediaType: 'image' | 'video' | null = null;

    if (activeMediaTab === 'upload') {
      if (!selectedStatusFile || !selectedMediaType) {
        toast({ title: "Error", description: "Please select an image or video file to upload.", variant: "destructive" });
        return;
      }
      mediaToPost = selectedStatusFile;
      finalMediaType = selectedMediaType;
    } else if (activeMediaTab === 'url') {
      if (!statusMediaUrlInput.trim()) {
        toast({ title: "Error", description: "Please enter an image URL.", variant: "destructive" });
        return;
      }
      if (!statusMediaUrlInput.startsWith('http://') && !statusMediaUrlInput.startsWith('https://')) {
        toast({ title: "Invalid URL", description: "Image URL must start with http:// or https://.", variant: "destructive" });
        return;
      }
      // For URL, assume it's an image unless we add more complex URL type detection
      if (statusMediaUrlInput.match(/\.(jpeg|jpg|gif|png)$/) != null) {
         finalMediaType = 'image'; 
      } else if (statusMediaUrlInput.match(/\.(mp4|webm|ogg)$/) != null) {
         // Basic video URL detection - might not be robust enough for all cases
         // For now, the lib/statusActions only supports string URLs for images
         // To support video URLs, statusActions.addMediaStatus would need adjustment
         toast({ title: "Video URL Not Supported Yet", description: "Currently, only image URLs are supported for direct input. Please upload video files.", variant: "destructive" });
         return;
      } else {
         toast({ title: "Unsupported URL", description: "Please provide a direct URL to an image (e.g., .png, .jpg).", variant: "destructive" });
         return;
      }
      mediaToPost = statusMediaUrlInput.trim();
    }

    if (!mediaToPost || !finalMediaType) return;

    setIsPostingStatus(true);
    try {
      await addMediaStatus(user.uid, mediaToPost, finalMediaType, statusMediaCaption);
      toast({ title: "Success", description: "Status posted." });
      setIsMediaStatusModalOpen(false);
      setSelectedStatusFile(null);
      setSelectedMediaType(null);
      setStatusMediaUrlInput("");
      setStatusMediaCaption("");
      if(statusFileInputRef.current) statusFileInputRef.current.value = "";
      setActiveMediaTab("upload");
      await refreshStatuses();
    } catch (error: any)      {
      toast({ title: "Error", description: error.message || "Failed to post media status.", variant: "destructive" });
    } finally {
      setIsPostingStatus(false);
    }
  };

  const openStatusViewer = (group: UserStatusGroup) => {
    if (group.statuses.length === 0) {
        if (group.userId === user?.uid) {
            // If user has no statuses, directly open add media dialog
            setIsMediaStatusModalOpen(true);
        }
        // If other user has no status, do nothing or show a message
        return;
    }
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
      closeStatusViewer(); 
    }
  };

  const prevStatus = () => {
    if (viewingStatus && currentStatusIndex > 0) {
      setCurrentStatusIndex(prev => prev - 1);
    }
  };

  const myCurrentStatusGroup = myStatusGroups.length > 0 ? myStatusGroups[0] : null;
  const recentUpdates = friendsStatusGroups.filter(group => group.statuses.length > 0);


  if (authLoading || !user) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading...</p></div>;
  }

  const canPostMedia = activeMediaTab === 'upload' ? !!selectedStatusFile : !!statusMediaUrlInput.trim();

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
          <Card 
            className="mb-2 shadow-none border-0 rounded-none hover:bg-secondary/50 cursor-pointer"
             onClick={() => openStatusViewer(myCurrentStatusGroup || { userId: user.uid, statuses: [], userName: user.displayName || "Me", userAvatar: user.photoURL, dataAiHint: "person portrait" })}
          >
            <CardContent className="p-3 flex items-center space-x-3">
              <div className="relative">
                <Avatar className={`h-12 w-12 ${myCurrentStatusGroup && myCurrentStatusGroup.statuses.length > 0 ? 'border-2 border-primary' : 'border-2 border-muted'}`}>
                  <AvatarImage src={user.photoURL || undefined} alt="My Status" data-ai-hint="person portrait" />
                  <AvatarFallback>{user.displayName?.substring(0,1).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                {(!myCurrentStatusGroup || myCurrentStatusGroup.statuses.length === 0) && (
                     <button 
                        onClick={(e) => { e.stopPropagation(); setIsMediaStatusModalOpen(true);}} 
                        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background cursor-pointer hover:bg-primary/80"
                        aria-label="Add status"
                      >
                        <Plus className="h-3 w-3" />
                     </button>
                )}
              </div>
              <div className="flex-1">
                <p className="font-semibold">My Status</p>
                <p className="text-sm text-muted-foreground">
                  {myCurrentStatusGroup && myCurrentStatusGroup.statuses.length > 0 ? 
                    `${myCurrentStatusGroup.statuses.length} update${myCurrentStatusGroup.statuses.length !== 1 ? 's' : ''} \u00B7 ${myCurrentStatusGroup.lastStatusTime}` 
                    : "Tap to add status update"}
                </p>
              </div>
            </CardContent>
          </Card>

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
                      <AvatarFallback>{group.userName?.substring(0,1).toUpperCase() || "U"}</AvatarFallback>
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
        </ScrollArea>
      )}
      
      <div className="fixed bottom-20 right-6 md:bottom-6 md:right-6 z-20 flex flex-col space-y-3">
        <Dialog open={isTextStatusModalOpen} onOpenChange={setIsTextStatusModalOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full h-12 w-12 shadow-lg bg-muted hover:bg-muted/80">
                    <AlignLeft className="h-5 w-5 text-foreground" />
                    <span className="sr-only">New text status</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Text Status</DialogTitle>
                    <DialogDescription>Write something to share with your friends.</DialogDescription>
                </DialogHeader>
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

        <Dialog open={isMediaStatusModalOpen} onOpenChange={(isOpen) => {
            setIsMediaStatusModalOpen(isOpen);
            if (!isOpen) { 
                 setActiveMediaTab("upload");
                 setSelectedStatusFile(null);
                 setSelectedMediaType(null);
                 setStatusMediaUrlInput("");
                 setStatusMediaCaption("");
                 if(statusFileInputRef.current) statusFileInputRef.current.value = "";
            }
        }}>
            <DialogTrigger asChild>
                <Button size="icon" className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90">
                    <Camera className="h-6 w-6 text-primary-foreground" />
                    <span className="sr-only">New photo or video status</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Media Status</DialogTitle>
                    <DialogDescription>Share a photo or video with your friends.</DialogDescription>
                </DialogHeader>
                 <Tabs defaultValue="upload" value={activeMediaTab} onValueChange={(value) => setActiveMediaTab(value as 'upload' | 'url')} className="my-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">Upload Media</TabsTrigger>
                      <TabsTrigger value="url">Image from URL</TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="py-4 space-y-4">
                      <div>
                        <Label htmlFor="status-media-upload">Choose image or video</Label>
                        <Input id="status-media-upload" type="file" accept="image/*,video/*" onChange={handleStatusFileChange} ref={statusFileInputRef} />
                        {selectedStatusFile && <p className="text-sm text-muted-foreground mt-2">Selected: {selectedStatusFile.name} ({selectedMediaType})</p>}
                      </div>
                    </TabsContent>
                    <TabsContent value="url" className="py-4 space-y-4">
                       <div>
                        <Label htmlFor="status-media-url">Image URL</Label>
                        <Input 
                          id="status-media-url" 
                          placeholder="https://example.com/image.png" 
                          value={statusMediaUrlInput}
                          onChange={(e) => setStatusMediaUrlInput(e.target.value)}
                        />
                       </div>
                    </TabsContent>
                  </Tabs>
                <div>
                  <Label htmlFor="status-media-caption">Caption (optional)</Label>
                  <Textarea 
                    id="status-media-caption"
                    placeholder="Add a caption..." 
                    value={statusMediaCaption}
                    onChange={(e) => setStatusMediaCaption(e.target.value)}
                    rows={3}
                  />
                </div>
                 <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                    <Button onClick={handlePostMediaStatus} disabled={isPostingStatus || !canPostMedia}>
                        {isPostingStatus && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Post
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </div>

      {viewingStatus && viewingStatus.statuses.length > 0 && (
        <div 
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-0"
            onClick={(e) => { e.stopPropagation(); nextStatus();}} // Click on backdrop advances status
        >
            {/* Progress bars for multiple statuses */}
            {viewingStatus.statuses.length > 1 && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[95%] max-w-xl flex space-x-1 z-[52] px-2">
                {viewingStatus.statuses.map((_, idx) => (
                  <div key={idx} className="h-1 flex-1 bg-white/40 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${idx <= currentStatusIndex ? 'bg-white' : ''}`}
                      // Basic animation for current segment, can be improved with actual progress
                      style={{ width: idx === currentStatusIndex ? '100%' : (idx < currentStatusIndex ? '100%' : '0%') }} 
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Header: User avatar, name, timestamp, close button */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-[52]">
                <div className="flex items-center space-x-2">
                    <Avatar className="h-9 w-9 border border-white/50">
                        <AvatarImage src={viewingStatus.userAvatar || undefined} data-ai-hint={viewingStatus.dataAiHint || "person"}/>
                        <AvatarFallback>{viewingStatus.userName?.substring(0,1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-white font-semibold text-sm">{viewingStatus.userName}</p>
                        <p className="text-xs text-gray-300">{formatStatusTimestamp(viewingStatus.statuses[currentStatusIndex].createdAt.toDate())}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); closeStatusViewer(); }}>
                    <X className="h-5 w-5"/>
                </Button>
            </div>
            
            {/* Content: Image, Video, or Text */}
            <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {viewingStatus.statuses[currentStatusIndex].type === 'image' ? (
                    <div className="flex flex-col items-center justify-center max-h-full max-w-full">
                        <Image 
                            src={viewingStatus.statuses[currentStatusIndex].content} 
                            alt="Status image" 
                            layout="intrinsic" 
                            width={1080} // Common aspect ratio, adjust as needed
                            height={1920}
                            objectFit="contain"
                            className="max-h-[calc(100vh-100px)] max-w-full rounded-none md:rounded-lg" // Allow full bleed on mobile
                            data-ai-hint={viewingStatus.statuses[currentStatusIndex].dataAiHint || "status image"}
                            priority // Prioritize loading the current status image
                        />
                    </div>
                ) : viewingStatus.statuses[currentStatusIndex].type === 'video' ? (
                     <div className="flex flex-col items-center justify-center max-h-full max-w-full">
                        <video
                            key={viewingStatus.statuses[currentStatusIndex].id} // Key to re-mount video on status change
                            src={viewingStatus.statuses[currentStatusIndex].content}
                            controls
                            autoPlay
                            playsInline // Important for iOS
                            className="max-h-[calc(100vh-100px)] max-w-full md:rounded-lg bg-black"
                            data-ai-hint={viewingStatus.statuses[currentStatusIndex].dataAiHint || "status video"}
                        />
                    </div>
                ) : ( // Text status
                    <div className="bg-primary p-8 rounded-lg text-center max-w-md flex items-center justify-center aspect-square">
                        <p className="text-3xl text-primary-foreground whitespace-pre-wrap">
                            {viewingStatus.statuses[currentStatusIndex].content}
                        </p>
                    </div>
                )}
                 {/* Caption for Image/Video */}
                 {(viewingStatus.statuses[currentStatusIndex].type === 'image' || viewingStatus.statuses[currentStatusIndex].type === 'video') && viewingStatus.statuses[currentStatusIndex].caption && (
                    <p className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm p-2 rounded-md max-w-[90%] text-center whitespace-pre-wrap">
                        {viewingStatus.statuses[currentStatusIndex].caption}
                    </p>
                )}
            </div>

            {/* Navigation areas for prev/next status */}
            {viewingStatus.statuses.length > 1 && (
                 <>
                    {/* Left third for previous status */}
                    <div className="absolute left-0 top-0 h-full w-1/3 cursor-pointer z-[51]" onClick={(e) => { e.stopPropagation(); prevStatus(); }}/>
                    {/* Right third for next status */}
                    <div className="absolute right-0 top-0 h-full w-1/3 cursor-pointer z-[51]" onClick={(e) => { e.stopPropagation(); nextStatus(); }}/>
                 </>
            )}
        </div>
      )}
    </div>
  );
}
    

    
