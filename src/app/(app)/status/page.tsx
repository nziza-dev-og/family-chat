
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Edit3, Loader2, Plus, FileImage, AlignLeft, X, Link as LinkIcon, Mic, Play, Pause, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useRef, type ChangeEvent, useCallback } from "react";
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
import { cn } from "@/lib/utils"; 
import { Progress } from "@/components/ui/progress"; // Import Progress

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
  const [isVideoStatusPlaying, setIsVideoStatusPlaying] = useState(true);
  const [isVideoStatusMuted, setIsVideoStatusMuted] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);


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
       setStatusMediaUrlInput(""); 
    }
  };
  
  const handleUrlInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStatusMediaUrlInput(event.target.value);
    setSelectedStatusFile(null); 
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
      // Basic check for media type from URL extension
      if (statusMediaUrlInput.match(/\.(jpeg|jpg|gif|png|webp|avif)$/i) != null) {
         finalMediaType = 'image'; 
      } else if (statusMediaUrlInput.match(/\.(mp4|webm|ogg|mov)$/i) != null) {
         finalMediaType = 'video';
      } else {
         toast({ title: "Unsupported URL", description: "Only direct image/video URLs are supported.", variant: "destructive" });
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
    setIsVideoStatusPlaying(true);
    setVideoProgress(0);
  };
  
 const closeStatusViewer = useCallback(() => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    if (videoStatusRef.current) {
        videoStatusRef.current.pause();
    }
    setViewingStatus(null);
  }, []);


  const nextStatus = useCallback(() => {
    setViewingStatus(prevViewingStatus => {
      if (prevViewingStatus && currentStatusIndex < prevViewingStatus.statuses.length - 1) {
        setCurrentStatusIndex(prevIdx => prevIdx + 1);
        setVideoProgress(0);
        setIsVideoStatusPlaying(true);
        return prevViewingStatus;
      } else {
        closeStatusViewer();
        return null;
      }
    });
  }, [currentStatusIndex, closeStatusViewer]);

  const prevStatus = useCallback(() => {
    if (viewingStatus && currentStatusIndex > 0) {
      setCurrentStatusIndex(prev => prev - 1);
      setVideoProgress(0);
      setIsVideoStatusPlaying(true);
    }
  }, [viewingStatus, currentStatusIndex]);


   useEffect(() => {
    if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
    }
    if (viewingStatus && viewingStatus.statuses.length > 0) {
        const current = viewingStatus.statuses[currentStatusIndex];
        
        if (current.type === 'video') {
            if (videoStatusRef.current) {
                videoStatusRef.current.currentTime = 0;
                if (isVideoStatusPlaying) {
                    videoStatusRef.current.play().catch(e => console.error("Error playing video status:", e));
                } else {
                    videoStatusRef.current.pause();
                }
            }
            // Duration will be handled by 'onEnded' or manual navigation for videos.
            // No automatic timeout for videos unless they fail to play or load.
        } else { // Image or Text
            const duration = 5000; // 5 seconds for images/text
            statusTimeoutRef.current = setTimeout(() => {
                nextStatus();
            }, duration);
        }
    }
    return () => {
        if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
        }
    };
  }, [viewingStatus, currentStatusIndex, nextStatus, isVideoStatusPlaying]);

  useEffect(() => {
    const videoElement = videoStatusRef.current;
    if (!videoElement) return;

    const handleTimeUpdate = () => {
      if (videoElement.duration) {
        setVideoProgress((videoElement.currentTime / videoElement.duration) * 100);
      }
    };
    const handleVideoEnd = () => {
      nextStatus();
    };

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('ended', handleVideoEnd);
    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [videoStatusRef, nextStatus, viewingStatus, currentStatusIndex]);


  const myCurrentStatusGroup = myStatusGroups.length > 0 ? myStatusGroups[0] : null;
  const recentUpdates = friendsStatusGroups.filter(group => group.statuses.length > 0);


  if (authLoading || !user) {
    return <div className="flex-1 flex justify-center items-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-muted-foreground">Loading statuses...</p></div>;
  }

  const canPostMedia = activeMediaTab === 'upload' ? !!selectedStatusFile : !!statusMediaUrlInput.trim();

  const currentViewedStatus = viewingStatus?.statuses[currentStatusIndex];

  const toggleVideoPlayPause = () => {
    if (videoStatusRef.current) {
      if (videoStatusRef.current.paused || videoStatusRef.current.ended) {
        videoStatusRef.current.play();
        setIsVideoStatusPlaying(true);
      } else {
        videoStatusRef.current.pause();
        setIsVideoStatusPlaying(false);
      }
    }
  };

  const toggleVideoMute = () => {
    if (videoStatusRef.current) {
      videoStatusRef.current.muted = !videoStatusRef.current.muted;
      setIsVideoStatusMuted(videoStatusRef.current.muted);
    }
  };


  return (
    <div className="flex flex-col h-full">
      {isLoadingStatus ? (
        <div className="flex-1 flex justify-center items-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 md:p-4">
            <Card 
              className="mb-3 shadow-sm hover:bg-secondary/30 cursor-pointer transition-colors rounded-lg"
              onClick={() => openStatusViewer(myCurrentStatusGroup || { userId: user.uid, statuses: [], userName: user.displayName || "Me", userAvatar: user.photoURL, dataAiHint: "person portrait" })}
            >
              <CardContent className="p-3 flex items-center space-x-3.5">
                <div className="relative">
                  <Avatar className={`h-12 w-12 ${myCurrentStatusGroup && myCurrentStatusGroup.statuses.length > 0 ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'ring-2 ring-muted ring-offset-2 ring-offset-card'}`}>
                    <AvatarImage src={user.photoURL || undefined} alt="My Status" data-ai-hint="person portrait" />
                    <AvatarFallback className="bg-muted text-muted-foreground">{user.displayName?.substring(0,1).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  {(!myCurrentStatusGroup || myCurrentStatusGroup.statuses.length === 0) && (
                       <button 
                          onClick={(e) => { e.stopPropagation(); setIsMediaStatusModalOpen(true);}} 
                          className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-card cursor-pointer hover:bg-primary/80 shadow-md"
                          aria-label="Add status"
                        >
                          <Plus className="h-4 w-4" />
                       </button>
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-card-foreground">My Status</p>
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
                <h3 className="px-1 text-sm font-semibold text-muted-foreground mb-1.5">Recent updates</h3>
                {recentUpdates.map((group) => (
                  <Card key={group.userId} 
                    className="mb-2 shadow-sm hover:bg-secondary/30 cursor-pointer transition-colors rounded-lg"
                    onClick={() => openStatusViewer(group)}
                  >
                    <CardContent className="p-3 flex items-center space-x-3.5">
                       <Avatar className="h-12 w-12 ring-2 ring-primary ring-offset-2 ring-offset-card">
                        <AvatarImage src={group.userAvatar || undefined} alt={group.userName || "User"} data-ai-hint={group.dataAiHint || "person"} />
                        <AvatarFallback className="bg-muted text-muted-foreground">{group.userName?.substring(0,1).toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold text-card-foreground">{group.userName}</p>
                        <p className="text-sm text-muted-foreground">{group.lastStatusTime}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
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
                <Button size="icon" className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground">
                    <Camera className="h-6 w-6" />
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
                      <TabsTrigger value="url">Media from URL</TabsTrigger>
                    </TabsList>
                    <TabsContent value="upload" className="py-4 space-y-4">
                      <div>
                        <Label htmlFor="status-media-upload">Choose image or video</Label>
                        <Input id="status-media-upload" type="file" accept="image/*,video/*" onChange={handleStatusFileChange} ref={statusFileInputRef} className="mt-1"/>
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
                           className="mt-1"
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
                    className="mt-1"
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

       {viewingStatus && viewingStatus.statuses.length > 0 && currentViewedStatus && (
        <div 
            className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-start p-0 select-none"
            onClick={(e) => { e.stopPropagation(); /* Backdrop click handled by nav areas */}} 
        >
            {/* Progress Bars */}
            {viewingStatus.statuses.length > 1 && (
              <div className="flex space-x-1 w-full max-w-2xl mx-auto pt-3 px-2 md:pt-4 md:px-4 z-[52]">
                {viewingStatus.statuses.map((_, idx) => (
                    <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden relative">
                        {idx < currentStatusIndex && <div className="h-full bg-white w-full absolute top-0 left-0" />}
                        {idx === currentStatusIndex && (
                            currentViewedStatus.type === 'video' ?
                            <Progress value={videoProgress} className="h-full w-full [&>div]:bg-white bg-transparent" />
                            :
                            <div 
                                className="h-full bg-white absolute top-0 left-0 animate-progress-fill-status"
                                style={{ animationDuration: '5s' }} 
                            />
                        )}
                    </div>
                ))}
              </div>
            )}
            <style jsx global>{`
              @keyframes progressFillAnimStatus { 
                from { width: 0%; }
                to { width: 100%; }
              }
              .animate-progress-fill-status {
                animation-name: progressFillAnimStatus;
                animation-timing-function: linear;
                animation-fill-mode: forwards;
              }
            `}</style>

            {/* Header */}
            <div className="flex items-center justify-between w-full max-w-2xl mx-auto py-2 px-2 md:px-4 z-[52]">
                <div className="flex items-center space-x-2.5">
                    <Avatar className="h-9 w-9 border border-white/40">
                        <AvatarImage src={viewingStatus.userAvatar || undefined} data-ai-hint={viewingStatus.dataAiHint || "person"}/>
                        <AvatarFallback className="bg-gray-700 text-white text-sm">{viewingStatus.userName?.substring(0,1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="text-white font-semibold text-sm">{viewingStatus.userName}</p>
                        <p className="text-xs text-gray-300">{formatStatusTimestamp(currentViewedStatus.createdAt.toDate())}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {currentViewedStatus.type === 'video' && videoStatusRef.current && (
                        <>
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={(e) => {e.stopPropagation(); toggleVideoPlayPause();}}>
                            {isVideoStatusPlaying ? <Pause className="h-4 w-4"/> : <Play className="h-4 w-4"/>}
                        </Button>
                        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={(e) => {e.stopPropagation(); toggleVideoMute();}}>
                             {isVideoStatusMuted ? <VolumeX className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
                        </Button>
                        </>
                    )}
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-full h-9 w-9" onClick={(e) => { e.stopPropagation(); closeStatusViewer(); }}>
                        <X className="h-5 w-5"/>
                    </Button>
                </div>
            </div>
            
            {/* Content Area */}
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden my-2" onClick={(e) => e.stopPropagation()}>
                {currentViewedStatus.type === 'image' ? (
                    <div className="flex flex-col items-center justify-center max-h-full max-w-full">
                        <Image 
                            src={currentViewedStatus.content} 
                            alt="Status image" 
                            layout="intrinsic" 
                            width={1080} 
                            height={1920}
                            objectFit="contain"
                            className="max-h-[calc(100vh-160px)] max-w-full rounded-none md:rounded-md shadow-lg" 
                            data-ai-hint={currentViewedStatus.dataAiHint || "status image"}
                            priority 
                        />
                    </div>
                ) : currentViewedStatus.type === 'video' ? (
                     <div className="flex flex-col items-center justify-center max-h-full max-w-full w-full h-full">
                        <video
                            ref={videoStatusRef}
                            key={currentViewedStatus.id}
                            src={currentViewedStatus.content}
                            controls={false}
                            autoPlay={isVideoStatusPlaying}
                            muted={isVideoStatusMuted}
                            playsInline 
                            className="max-h-[calc(100vh-160px)] max-w-full md:rounded-md bg-black shadow-lg w-auto h-auto object-contain"
                            data-ai-hint={currentViewedStatus.dataAiHint || "status video"}
                            // onEnded={nextStatus} // Handled by useEffect on videoElement
                        />
                    </div>
                ) : ( 
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-700 p-8 rounded-none md:rounded-lg text-center max-w-lg w-[95vw] h-auto min-h-[60vh] flex items-center justify-center shadow-2xl">
                        <p className="text-3xl md:text-4xl lg:text-5xl text-white font-semibold whitespace-pre-wrap break-words leading-tight">
                            {currentViewedStatus.content}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Caption */}
            {(currentViewedStatus.type === 'image' || currentViewedStatus.type === 'video') && currentViewedStatus.caption && (
                <div className="w-full pb-4 px-2 md:pb-6 md:px-4 z-[52]">
                  <p className="bg-black/70 text-white text-sm p-2.5 px-4 rounded-lg max-w-xl mx-auto text-center whitespace-pre-wrap shadow-md">
                      {currentViewedStatus.caption}
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
