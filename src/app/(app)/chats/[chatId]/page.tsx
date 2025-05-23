
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, Send, Smile, ArrowLeft, Phone, Video, MoreVertical, Loader2, GripHorizontal, Info, Search as SearchIcon, Users, Mic, X, Camera as CameraIcon, UserCircle, Activity } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef, type KeyboardEvent, Suspense } from "react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, Timestamp, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  senderId: string;
  text?: string;
  imageUrl?: string;
  timestamp: Timestamp;
  type?: 'text' | 'image' | 'event_missed_call' | 'voice';
  mediaUrl?: string; 
  mediaDuration?: string;
  senderDisplayName?: string; 
  senderAvatar?: string;
}

interface ChatPartner {
  uid: string;
  name: string;
  avatar: string;
  status?: string; 
  dataAiHint: string;
  isGroup?: boolean;
  participantsCount?: number; // For groups
}

const emojiCategories = {
  "Smileys & People": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👋", "🤚", "🖐", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿", "🦶", "👂", "🦻", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "💋", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "🧔‍♀️", "🧔‍♂️", "👨‍🦰", "👨‍🦱", "👨‍🦳", "👨‍🦲", "👩", "👩‍🦰", "🧑‍🦰", "👩‍🦱", "👩‍🦳", "👩‍🦲", "👱‍♀️", "👱‍♂️", "🧓", "👴", "👵"],
  "Animals & Nature": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🦬", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍", "🐈", "🐈‍⬛", "🪶", "🐾", "🐉", "🐲", "🌵", "🎄", "🌲", "🌳", "🌴", "🪵", "🌱", "🌿", "☘️", "🍀", "🎍", "🪴", "🎋", "🍃", "🍂", "🍁", "🍄", "🐚", "🪨", "🌾", "💐", "🌷", "🌹", "🥀", "🪷", "🌺", "🌸", "🌼", "🌻", "🌞", "🌝", "🌛", "🌜", "🌚", "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔", "🌙", "🌎", "🌍", "🌏", "🪐", "💫", "⭐️", "🌟", "✨", "⚡️", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "🌤️", "⛅️", "🌥️", "☁️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️", "❄️", "☃️", "⛄️", "🌬️", "💨", "💧", "💦", "🫧", "☂️", "☔️", "🌊", "🌫️"],
  "Food & Drink": ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🫒", "🧄", "🧅", "🥔", "🍠", "🫚", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🧆", "🌮", "🌯", "🫔", "🥗", "🥘", "🫕", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🫘", "🍯", "🥛", "🍼", "🫖", "☕️", "🍵", "🧃", "🥤", "🧋", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡", "🥢", "🧂"],
};

const GroupInfoPanel = ({ chatPartner, onClose }: { chatPartner: ChatPartner | null; onClose: () => void }) => {
  if (!chatPartner || !chatPartner.isGroup) return null;

  return (
    <div className="w-full md:w-80 lg:w-96 border-l border-border bg-group-info-background p-4 flex-col h-full overflow-y-auto hidden lg:flex shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-group-info-foreground">Group Info</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-group-info-foreground hover:bg-secondary/20 rounded-full">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex flex-col items-center mb-6">
        <Avatar className="h-24 w-24 mb-3 border-4 border-primary/30">
            <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
            <AvatarFallback className="text-3xl bg-muted text-muted-foreground">{chatPartner.name.substring(0,1)}</AvatarFallback>
        </Avatar>
        <h3 className="text-xl font-semibold text-group-info-foreground">{chatPartner.name}</h3>
        <p className="text-sm text-muted-foreground">{chatPartner.participantsCount} members</p>
      </div>
      
      <div className="space-y-4">
        <div>
          <h4 className="font-medium text-group-info-foreground mb-1 text-sm">Description</h4>
          <p className="text-xs text-muted-foreground">This is where the group description would go. It can be edited by admins.</p>
        </div>
        <div>
          <h4 className="font-medium text-group-info-foreground mb-2 text-sm">Members ({chatPartner.participantsCount})</h4>
          <ScrollArea className="h-48">
            {/* Placeholder members - replace with actual participant data */}
            {Array.from({ length: chatPartner.participantsCount || 0 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-2 p-1.5 hover:bg-secondary/10 rounded-md">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={`https://placehold.co/40x40.png?text=U${i+1}`} alt={`User ${i+1}`} data-ai-hint="person portrait" />
                  <AvatarFallback className="text-xs bg-muted">U{i+1}</AvatarFallback>
                </Avatar>
                <span className="text-xs text-group-info-foreground">User {i+1} Name</span>
              </div>
            ))}
          </ScrollArea>
        </div>
         <div>
          <h4 className="font-medium text-group-info-foreground mb-2 text-sm">Shared Media</h4>
          <p className="text-xs text-muted-foreground">No media shared yet.</p>
          {/* Placeholder for media grid */}
        </div>
      </div>
       <Button variant="outline" className="mt-auto w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/50">
        Exit Group
      </Button>
    </div>
  );
};


function ChatPageContent() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const chatId = params.chatId as string;

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatPartner, setChatPartner] = useState<ChatPartner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isGroupInfoPanelOpen, setIsGroupInfoPanelOpen] = useState(false);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!user || !chatId) {
      setIsLoading(false); 
      return;
    }
    setIsLoading(true);

    const fetchChatDetails = async () => {
      try {
        const chatDocRef = doc(db, "chats", chatId);
        const chatDocSnap = await getDoc(chatDocRef);

        if (chatDocSnap.exists()) {
          const chatData = chatDocSnap.data();
          const partnerId = chatData.participants.find((pId: string) => pId !== user.uid);
          
          if (chatData.isGroup) {
             setChatPartner({
                uid: chatId,
                name: chatData.groupName || "Group Chat",
                avatar: chatData.groupAvatar || "https://placehold.co/100x100.png",
                status: `${chatData.participants.length} members`, 
                dataAiHint: "group people",
                isGroup: true,
                participantsCount: chatData.participants.length,
              });
          } else if (partnerId) {
            const userDocRef = doc(db, "users", partnerId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              const partnerData = userDocSnap.data();
              setChatPartner({
                uid: partnerId,
                name: partnerData.displayName || "Chat User",
                avatar: partnerData.photoURL || "https://placehold.co/100x100.png",
                status: "Online", // Placeholder
                dataAiHint: "person portrait",
                isGroup: false,
              });
            }
          } else {
             toast({title: "Error", description: "Could not determine chat partner.", variant: "destructive"});
             router.replace("/chats"); 
             return;
          }
        } else {
          toast({title: "Error", description: "Chat not found.", variant: "destructive"});
          router.replace("/chats");
          return;
        }
      } catch (error) {
        console.error("Error fetching chat details:", error);
        toast({title: "Error", description: "Could not load chat details.", variant: "destructive"});
      } finally {
        setIsLoading(false);
      }
    };

    fetchChatDetails();

    const messagesColRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesColRef, orderBy("timestamp", "asc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const msgs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    }, (error) => {
      console.error("Error fetching messages:", error);
      toast({title: "Error", description: "Could not load messages.", variant: "destructive"});
    });

    return () => unsubscribe();

  }, [user, chatId, router, toast]);

  const handleSendMessage = async () => {
    if (!user || !newMessage.trim()) return;

    const messagesColRef = collection(db, "chats", chatId, "messages");
    const chatDocRef = doc(db, "chats", chatId);
    try {
      await addDoc(messagesColRef, {
        senderId: user.uid,
        text: newMessage,
        timestamp: serverTimestamp(),
        type: 'text',
      });
      await updateDoc(chatDocRef, {
        lastMessage: { text: newMessage, senderId: user.uid },
        lastMessageTimestamp: serverTimestamp(),
      });
      setNewMessage("");
      setIsEmojiPickerOpen(false);
    } catch (error) {
      console.error("Error sending message:", error);
      toast({title: "Error", description: "Failed to send message.", variant: "destructive"});
    }
  };
  
  const handleTextareaKeyPress = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: Timestamp | null) => {
    if (!timestamp) return "";
    return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleEmojiSelect = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const handleGifButtonClick = () => {
    toast({
      title: "Coming Soon!",
      description: "GIF selection functionality will be added in a future update.",
    });
  };

  const handleAttachmentClick = () => {
    toast({
      title: "Coming Soon!",
      description: "File attachment functionality will be added in a future update.",
    });
  };
  
  const handleVoiceMessageClick = () => {
    toast({
      title: "Coming Soon!",
      description: "Voice message functionality will be added in a future update.",
    });
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-card h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading chat...</p>
      </div>
    );
  }
  
  if (!chatPartner) {
     return (
      <div className="flex-1 flex flex-col items-center justify-center bg-card h-full">
        <p className="text-muted-foreground">Select a chat to start messaging.</p>
      </div>
    );
  }

  const showBackButton = !params?.chatId || (typeof window !== 'undefined' && window.innerWidth < 768);

  return (
    <div className="flex-1 flex h-full">
      <div className="flex-1 flex flex-col bg-card h-full">
        <header className="flex items-center p-3 border-b border-border bg-card sticky top-0 z-10 shadow-sm h-[var(--header-height)]">
          {showBackButton && (
            <Button variant="ghost" size="icon" className="mr-2 md:hidden text-foreground hover:bg-accent/10 rounded-full" onClick={() => router.push("/chats")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10 mr-3 border-2 border-border">
            <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
            <AvatarFallback className="bg-muted text-muted-foreground">{chatPartner.name.substring(0,1)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="font-semibold text-base text-foreground">{chatPartner.name}</h2>
            <p className="text-xs text-muted-foreground">{chatPartner.status}</p>
          </div>
          <div className="flex items-center space-x-0.5">
            <Button variant="ghost" size="icon" aria-label="Search in chat" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full">
              <SearchIcon className="h-5 w-5" />
            </Button>
            <Link href={`/call/audio/${chatId}`} passHref>
              <Button variant="ghost" size="icon" aria-label="Start audio call" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full">
                <Phone className="h-5 w-5" />
              </Button>
            </Link>
            <Link href={`/videosdk-call`} passHref>
              <Button variant="ghost" size="icon" aria-label="Start video call" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full">
                <Video className="h-5 w-5" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" aria-label={chatPartner.isGroup ? "Group Info" : "More options"} className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full" onClick={() => setIsGroupInfoPanelOpen(prev => !prev)}>
              {chatPartner.isGroup ? <Users className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 overflow-y-auto p-4 space-y-2 chat-bg">
          {messages.map((msg, index) => {
            const isUser = msg.senderId === user?.uid;
            const prevMessage = messages[index-1];
            const showSenderName = chatPartner.isGroup && !isUser && (prevMessage?.senderId !== msg.senderId || index === 0);

            return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && (
                 <Avatar className={cn("h-7 w-7 mr-2 self-end shrink-0", chatPartner.isGroup ? (showSenderName ? "" : "opacity-0") : "")}>
                    <AvatarImage src={isUser ? user?.photoURL || undefined : msg.senderAvatar || chatPartner.avatar} alt={isUser ? user?.displayName || "You" : msg.senderDisplayName || chatPartner.name} data-ai-hint="person portrait" />
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground">{isUser ? user?.displayName?.substring(0,1) || "Y" : msg.senderDisplayName?.substring(0,1) || chatPartner.name.substring(0,1) || "U"}</AvatarFallback>
                  </Avatar>
              )}
              <div className={`max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                {showSenderName && (
                  <span className="text-xs text-muted-foreground mb-0.5 ml-2">{
                     msg.senderDisplayName || "Other User"
                  }</span>
                )}
                {msg.type === 'event_missed_call' ? (
                    <div className="w-full flex justify-center my-2">
                        <div className="text-xs text-center text-muted-foreground bg-muted/70 px-3 py-1.5 rounded-full shadow-sm">
                            {msg.text}
                        </div>
                    </div>
                ) : (
                  <div
                    className={cn(
                      "p-2.5 rounded-xl shadow-sm text-sm break-words relative",
                      isUser
                        ? 'bg-chat-bubble-outgoing-background text-chat-bubble-outgoing-foreground ml-auto rounded-br-sm'
                        : 'bg-chat-bubble-incoming-background text-chat-bubble-incoming-foreground rounded-bl-sm',
                    )}
                  >
                    {msg.type === 'image' && msg.imageUrl ? (
                      <Image src={msg.imageUrl} alt="Sent image" width={300} height={200} className="rounded-md object-cover max-w-xs cursor-pointer" data-ai-hint="chat image"/>
                    ) : msg.type === 'voice' && msg.mediaUrl ? (
                       <div className="flex items-center space-x-2 text-foreground/80 py-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 hover:bg-primary/10">
                            <Mic className="h-4 w-4 text-primary" />
                          </Button>
                          <div className="w-32 h-1 bg-muted-foreground/30 rounded-full relative">
                            <div className="absolute left-0 top-0 h-1 bg-primary rounded-full" style={{width: `${Math.random()*80 + 10}%`}}></div>
                          </div>
                          <span className="text-xs">{msg.mediaDuration || "0:15"}</span>
                       </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                    <p className={`text-[10px] mt-1.5 ${isUser ? 'text-right text-chat-bubble-outgoing-foreground/70' : 'text-left text-chat-bubble-incoming-foreground/70'}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                )}
              </div>
               {isUser && (
                 <Avatar className="h-7 w-7 ml-2 self-end shrink-0">
                    <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || "You"} data-ai-hint="person portrait" />
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground">{user?.displayName?.substring(0,1) || "Y"}</AvatarFallback>
                  </Avatar>
              )}
            </div>
          )})}
          <div ref={messagesEndRef} />
        </ScrollArea>

        <footer className="p-3 border-t border-border bg-card sticky bottom-0 z-10">
          <div className="flex items-end space-x-2">
             <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full w-10 h-10 shrink-0">
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-[320px] sm:max-w-sm p-0 border-border shadow-xl mb-2 rounded-xl bg-background" side="top" align="start">
                <ScrollArea className="h-[280px] sm:h-[320px] p-2">
                  {Object.entries(emojiCategories).map(([category, emojis]) => (
                    <div key={category} className="mb-3">
                      <p className="text-xs font-semibold text-muted-foreground px-1.5 mb-1.5 sticky top-0 bg-background/80 backdrop-blur-sm py-1">{category}</p>
                      <div className="grid grid-cols-8 sm:grid-cols-9 gap-0.5">
                        {emojis.map((emoji) => (
                          <Button
                            key={emoji}
                            variant="ghost"
                            className="text-xl p-0 h-8 w-8 aspect-square hover:bg-accent/50 rounded-md"
                            onClick={() => { handleEmojiSelect(emoji); /* setIsEmojiPickerOpen(false); */ }}
                          >
                            {emoji}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </PopoverContent>
            </Popover>
             <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full w-10 h-10 shrink-0" onClick={handleGifButtonClick}>
              <GripHorizontal className="h-5 w-5" />
            </Button>
            <Textarea
              placeholder="Type a message..."
              className="flex-1 rounded-xl px-4 py-2.5 bg-secondary border-transparent focus:bg-card focus:border-primary focus-visible:ring-primary text-sm min-h-[40px] max-h-[120px] resize-none"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleTextareaKeyPress} 
              rows={1}
            />
             <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full w-10 h-10 shrink-0" onClick={handleAttachmentClick}>
              <Paperclip className="h-5 w-5" />
            </Button>
             {newMessage.trim() ? (
              <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground w-10 h-10 shrink-0 shadow-md" onClick={handleSendMessage}>
                <Send className="h-5 w-5" />
              </Button>
             ) : (
              <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground w-10 h-10 shrink-0 shadow-md" onClick={handleVoiceMessageClick}>
                <Mic className="h-5 w-5" />
              </Button>
             )}
          </div>
        </footer>
      </div>
      {isGroupInfoPanelOpen && chatPartner?.isGroup && (
        <GroupInfoPanel chatPartner={chatPartner} onClose={() => setIsGroupInfoPanelOpen(false)} />
      )}
    </div>
  );
}


export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex flex-col items-center justify-center bg-card h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="mt-4 text-muted-foreground">Loading chat...</p></div>}>
      <ChatPageContent />
    </Suspense>
  )
}
