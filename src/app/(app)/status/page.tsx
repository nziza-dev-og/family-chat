
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Edit3, Loader2, Plus, FileImage, AlignLeft, X, Link as LinkIcon, Mic } from "lucide-react";
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
import { cn } from "@/lib/utils"; // Import cn

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
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoStatusRef = useRef<HTMLVideoElement>(null);


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
       setStatusMediaUrlInput(""); // Clear URL if file is chosen
    }
  };
  
  const handleUrlInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStatusMediaUrlInput(event.target.value);
    setSelectedStatusFile(null); // Clear file if URL is typed
    setSelectedMediaType(null);
    if(statusFileInputRef.current) statusFileInputRef.current.value = "";
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
        toast({ title: "Error", description: "Please enter an image or video URL.", variant: "destructive" });
        return;
      }
      if (!statusMediaUrlInput.startsWith('http://') && !statusMediaUrlInput.startsWith('https://')) {
        toast({ title: "Invalid URL", description: "URL must start with http:// or https://.", variant: "destructive" });
        return;
      }
      if (statusMediaUrlInput.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null) {
         finalMediaType = 'image'; 
      } else if (statusMediaUrlInput.match(/\.(mp4|webm|ogg)$/i) != null) {
         finalMediaType = 'video';
      } else {
         toast({ title: "Unsupported URL", description: "Only direct image/video URLs (.png, .jpg, .mp4 etc.) supported.", variant: "destructive" });
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
            setIsMediaStatusModalOpen(true);
        }
        return;
    }
    setViewingStatus(group);
    setCurrentStatusIndex(0);
  };
  
  useEffect(() => {
    if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
    }
    if (viewingStatus && viewingStatus.statuses.length > 0) {
        const current = viewingStatus.statuses[currentStatusIndex];
        let duration = current.type === 'video' ? 15000 : 5000; 
        
        if (current.type === 'video' && videoStatusRef.current) {
          videoStatusRef.current.currentTime = 0;
          videoStatusRef.current.play().catch(e => console.error("Error playing video status:", e));
          // Duration will be handled by 'onEnded' or if video is shorter than 15s, the timeout will kick in.
          // For very long videos, this timeout acts as a fallback.
        }

        statusTimeoutRef.current = setTimeout(() => {
            nextStatus();
        }, duration);
    }
    return () => {
        if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
        }
    };
  }, [viewingStatus, currentStatusIndex]);


  const closeStatusViewer = () => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    setViewingStatus(null);
  };

  const nextStatus = useCallback(() => {
    setViewingStatus(prevViewingStatus => {
      if (prevViewingStatus && currentStatusIndex < prevViewingStatus.statuses.length - 1) {
        setCurrentStatusIndex(prevIdx => prevIdx + 1);
        return prevViewingStatus;
      } else {
        closeStatusViewer();
        return null;
      }
    });
  }, [currentStatusIndex]);

  const prevStatus = useCallback(() => {
    if (viewingStatus && currentStatusIndex > 0) {
      setCurrentStatusIndex(prev => prev - 1);
    }
  }, [viewingStatus, currentStatusIndex]);

  const myCurrentStatusGroup = myStatusGroups.length > 0 ? myStatusGroups[0] : null;
  const recentUpdates = friendsStatusGroups.filter(group => group.statuses.length > 0);


  if (authLoading || !user) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2 text-muted-foreground">Loading...</p></div>;
  }

  const canPostMedia = activeMediaTab === 'upload' ? !!selectedStatusFile : !!statusMediaUrlInput.trim();

  return (
    <div className="flex flex-col h-full bg-card md:bg-background"> {/* Match card bg for mobile list */}
      <CardHeader className="px-4 py-4 border-b border-border sticky top-0 bg-card z-10 md:hidden">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">Status</CardTitle>
          {/* Add actions if needed for mobile header */}
        </div>
      </CardHeader>

      {isLoadingStatus ? (
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="flex-1 md:p-4 lg:p-6">
          <Card 
            className="mb-1 shadow-none border-0 border-b md:rounded-lg md:border md:shadow-sm hover:bg-secondary/30 cursor-pointer"
             onClick={() => openStatusViewer(myCurrentStatusGroup || { userId: user.uid, statuses: [], userName: user.displayName || "Me", userAvatar: user.photoURL, dataAiHint: "person portrait" })}
          >
            <CardContent className="p-3 flex items-center space-x-3">
              <div className="relative">
                <Avatar className={`h-12 w-12 ${myCurrentStatusGroup && myCurrentStatusGroup.statuses.length > 0 ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'ring-2 ring-muted ring-offset-2 ring-offset-card'}`}>
                  <AvatarImage src={user.photoURL || undefined} alt="My Status" data-ai-hint="person portrait" />
                  <AvatarFallback>{user.displayName?.substring(0,1).toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                {(!myCurrentStatusGroup || myCurrentStatusGroup.statuses.length === 0) && (
                     <button 
                        onClick={(e) => { e.stopPropagation(); setIsMediaStatusModalOpen(true);}} 
                        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-card cursor-pointer hover:bg-primary/80 shadow-md"
                        aria-label="Add status"
                      >
                        <Plus className="h-3.5 w-3.5" />
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
            <div className="py-2 md:mt-4">
              <h3 className="px-3 text-sm font-semibold text-muted-foreground mb-1">Recent updates</h3>
              {recentUpdates.map((group) => (
                <Card key={group.userId} 
                  className="mb-0.5 shadow-none border-0 border-b md:rounded-lg md:border md:shadow-sm md:mb-2 hover:bg-secondary/30 cursor-pointer"
                  onClick={() => openStatusViewer(group)}
                >
                  <CardContent className="p-3 flex items-center space-x-3">
                     <Avatar className="h-12 w-12 ring-2 ring-primary ring-offset-2 ring-offset-card">
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
      
      <div className="fixed bottom-6 right-6 z-20 flex flex-col space-y-3">
        <Dialog open={isTextStatusModalOpen} onOpenChange={setIsTextStatusModalOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full h-12 w-12 shadow-lg bg-card hover:bg-muted border-border text-foreground">
                    <AlignLeft className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Text Status</DialogTitle>
                    <DialogDescription>Write something to share.</DialogDescription>
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
                <Button size="icon" className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Camera className="h-6 w-6" />
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Media Status</DialogTitle>
                    <DialogDescription>Share a photo or video.</DialogDescription>
                </DialogHeader>
                 <Tabs defaultValue="upload" value={activeMediaTab} onValueChange={(value) => setActiveMediaTab(value as 'upload' | 'url')} className="my-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="upload">Upload Media</TabsTrigger>
                      <TabsTrigger value="url">Media from URL</TabsTrigger>
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
                        <Label htmlFor="status-media-url">Image or Video URL</Label>
                        <Input 
                          id="status-media-url" 
                          placeholder="https://example.com/media.png" 
                          value={statusMediaUrlInput}
                          onChange={handleUrlInputChange}
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
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-between p-0 select-none"
            onClick={(e) => { e.stopPropagation(); /* Backdrop click handled by nav areas */}} 
        >
            <div className="w-full pt-3 px-2 md:pt-4 md:px-4">
              {viewingStatus.statuses.length > 1 && (
                <div className="flex space-x-1 w-full max-w-2xl mx-auto mb-2">
                  {viewingStatus.statuses.map((_, idx) => (
                    <div key={idx} className="h-0.5 flex-1 bg-white/30 rounded-full overflow-hidden relative">
                      <div 
                        className={cn(
                          "h-full bg-white absolute top-0 left-0",
                          idx < currentStatusIndex ? 'w-full' : 'w-0',
                          idx === currentStatusIndex && 'animate-progress-fill-status'
                        )}
                        style={{ 
                          animationDuration: idx === currentStatusIndex ? (viewingStatus.statuses[currentStatusIndex]?.type === 'video' ? (videoStatusRef.current?.duration ? `${videoStatusRef.current.duration}s` : '15s') : '5s') : undefined,
                         }} 
                      />
                    </div>
                  ))}
                </div>
              )}
              <style jsx global>{`
                @keyframes progressFillAnimStatus { /* Renamed to avoid conflict */
                  from { width: 0%; }
                  to { width: 100%; }
                }
                .animate-progress-fill-status {
                  animation-name: progressFillAnimStatus;
                  animation-timing-function: linear;
                  animation-fill-mode: forwards;
                }
              `}</style>

              <div className="flex items-center justify-between w-full max-w-2xl mx-auto">
                  <div className="flex items-center space-x-2">
                      <Avatar className="h-8 w-8 border border-white/30">
                          <AvatarImage src={viewingStatus.userAvatar || undefined} data-ai-hint={viewingStatus.dataAiHint || "person"}/>
                          <AvatarFallback className="bg-gray-700 text-white text-xs">{viewingStatus.userName?.substring(0,1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                          <p className="text-white font-semibold text-sm">{viewingStatus.userName}</p>
                          <p className="text-xs text-gray-300">{formatStatusTimestamp(viewingStatus.statuses[currentStatusIndex].createdAt.toDate())}</p>
                      </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full" onClick={(e) => { e.stopPropagation(); closeStatusViewer(); }}>
                      <X className="h-5 w-5"/>
                  </Button>
              </div>
            </div>
            
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden my-2" onClick={(e) => e.stopPropagation()}>
                {viewingStatus.statuses[currentStatusIndex].type === 'image' ? (
                    <div className="flex flex-col items-center justify-center max-h-full max-w-full">
                        <Image 
                            src={viewingStatus.statuses[currentStatusIndex].content} 
                            alt="Status image" 
                            layout="intrinsic" 
                            width={1080} 
                            height={1920} // Using a common portrait aspect ratio
                            objectFit="contain"
                            className="max-h-[calc(100vh-150px)] max-w-full rounded-none md:rounded-lg shadow-lg" 
                            data-ai-hint={viewingStatus.statuses[currentStatusIndex].dataAiHint || "status image"}
                            priority 
                        />
                    </div>
                ) : viewingStatus.statuses[currentStatusIndex].type === 'video' ? (
                     <div className="flex flex-col items-center justify-center max-h-full max-w-full w-full h-full">
                        <video
                            ref={videoStatusRef}
                            key={viewingStatus.statuses[currentStatusIndex].id} // Force re-render for new video
                            src={viewingStatus.statuses[currentStatusIndex].content}
                            controls={false}
                            autoPlay
                            playsInline 
                            className="max-h-[calc(100vh-150px)] max-w-full md:rounded-lg bg-black shadow-lg w-auto h-auto object-contain"
                            data-ai-hint={viewingStatus.statuses[currentStatusIndex].dataAiHint || "status video"}
                            onEnded={nextStatus}
                            onLoadedMetadata={(e) => { // Adjust progress bar duration based on video length
                              if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
                              const duration = e.currentTarget.duration;
                              statusTimeoutRef.current = setTimeout(nextStatus, duration * 1000);
                            }}
                        />
                    </div>
                ) : ( 
                    <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-8 rounded-lg text-center max-w-md w-[90vw] h-auto min-h-[50vh] flex items-center justify-center shadow-2xl">
                        <p className="text-3xl md:text-4xl text-white font-semibold whitespace-pre-wrap break-words">
                            {viewingStatus.statuses[currentStatusIndex].content}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Caption for Image/Video, placed at the bottom */}
            {(viewingStatus.statuses[currentStatusIndex].type === 'image' || viewingStatus.statuses[currentStatusIndex].type === 'video') && viewingStatus.statuses[currentStatusIndex].caption && (
                <div className="w-full pb-4 px-2 md:pb-6 md:px-4">
                  <p className="bg-black/60 text-white text-sm p-2 px-3 rounded-lg max-w-xl mx-auto text-center whitespace-pre-wrap shadow-md">
                      {viewingStatus.statuses[currentStatusIndex].caption}
                  </p>
                </div>
            )}

            {/* Navigation areas (invisible) */}
            <>
                <div className="absolute left-0 top-0 h-full w-1/3 cursor-pointer z-[51]" onClick={(e) => { e.stopPropagation(); prevStatus(); }}/>
                <div className="absolute right-0 top-0 h-full w-1/3 cursor-pointer z-[51]" onClick={(e) => { e.stopPropagation(); nextStatus(); }}/>
            </>
        </div>
      )}
    </div>
  );
}
