
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Send, Smile, ArrowLeft, Phone, Video, MoreVertical, Loader2, GripHorizontal, Info, Search as SearchIcon, Users, Mic } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
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
  type?: 'text' | 'image' | 'event_missed_call' | 'voice'; // Added voice
  mediaUrl?: string; // For voice or other media
  mediaDuration?: string; // For voice message duration
}

interface ChatPartner {
  uid: string;
  name: string;
  avatar: string;
  status?: string; // e.g., "23 members, 10 online" for groups
  dataAiHint: string;
  isGroup?: boolean;
}

const emojiCategories = {
  "Smileys & People": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👍", "👎", "👌", "🤏", "👈", "👉", "👆", "👇", "👋", "🤚", "🖐", "🖖", "❤️", "💔", "🎉", "✨", "🔥", "🙏"],
  "Animals & Nature": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🌲", "🌳", "🌴", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻", "🌼", "🌞", "🌛", "⭐"],
  "Food & Drink": ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🥗", "🥘", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧃", "🥤", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡", "🥢", "🧂"],
};

// Placeholder for Group Info Panel
const GroupInfoPanel = ({ chatPartner, onClose }: { chatPartner: ChatPartner | null; onClose: () => void }) => {
  if (!chatPartner || !chatPartner.isGroup) return null;

  return (
    <div className="w-80 border-l border-border bg-group-info-background p-4 flex-col h-full overflow-y-auto hidden lg:flex">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-group-info-foreground">Group Info</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-group-info-foreground hover:bg-secondary/20">
          <X className="h-5 w-5" />
        </Button>
      </div>
      {/* Placeholder content */}
      <p className="text-sm text-group-info-foreground/80">Files, members, and other group settings will appear here.</p>
      <div className="mt-4">
        <h3 className="font-medium text-group-info-foreground mb-2">23 members</h3>
        {/* Placeholder members */}
      </div>
    </div>
  );
};


export default function ChatPage() {
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
      messagesEndRef.current.scrollIntoView({ behavior: "auto" }); // Changed to auto for less jumpiness on new messages
    }
  }, [messages]);

  useEffect(() => {
    if (!user || !chatId) {
      setIsLoading(false); // Ensure loading state is false if no user/chatId
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
                status: `${chatData.participants.length} members, ${Math.floor(Math.random() * chatData.participants.length)} online`, // Placeholder online count
                dataAiHint: "group people",
                isGroup: true,
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
             router.replace("/chats"); // Go back to chat list if partner not found
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
    } catch (error) {
      console.error("Error sending message:", error);
      toast({title: "Error", description: "Failed to send message.", variant: "destructive"});
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
      <div className="flex-1 flex flex-col items-center justify-center bg-card">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading chat...</p>
      </div>
    );
  }
  
  if (!chatPartner) {
     return (
      <div className="flex-1 flex flex-col items-center justify-center bg-card">
        <p className="text-muted-foreground">Select a chat to start messaging.</p>
      </div>
    );
  }

  const showBackButton = !params?.chatId || window.innerWidth < 768;


  return (
    <div className="flex-1 flex h-full"> {/* Main container for chat view + group info */}
      <div className="flex-1 flex flex-col bg-card h-full">
        <header className="flex items-center p-3.5 border-b border-border bg-card sticky top-0 z-10 shadow-sm">
          {showBackButton && (
            <Button variant="ghost" size="icon" className="mr-2 md:hidden text-foreground hover:bg-accent/10" onClick={() => router.push("/chats")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10 mr-3 border-2 border-border">
            <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
            <AvatarFallback className="bg-muted text-muted-foreground">{chatPartner.name.substring(0,1)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h2 className="font-semibold text-base">{chatPartner.name}</h2>
            <p className="text-xs text-muted-foreground">{chatPartner.status}</p>
          </div>
          <div className="flex items-center space-x-1">
            <Button variant="ghost" size="icon" aria-label="Search in chat" className="text-foreground hover:bg-accent/10">
              <SearchIcon className="h-5 w-5" />
            </Button>
            <Link href={`/call/audio/${chatId}`} passHref>
              <Button variant="ghost" size="icon" aria-label="Start audio call" className="text-foreground hover:bg-accent/10">
                <Phone className="h-5 w-5" />
              </Button>
            </Link>
            <Link href={`/videocall?initialRoomId=${chatId}`} passHref>
              <Button variant="ghost" size="icon" aria-label="Start video call" className="text-foreground hover:bg-accent/10">
                <Video className="h-5 w-5" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" aria-label={chatPartner.isGroup ? "Group Info" : "More options"} className="text-foreground hover:bg-accent/10" onClick={() => setIsGroupInfoPanelOpen(prev => !prev)}>
              {chatPartner.isGroup ? <Users className="h-5 w-5" /> : <MoreVertical className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 overflow-y-auto p-4 space-y-3 chat-bg">
          {messages.map((msg, index) => {
            const isUser = msg.senderId === user?.uid;
            const prevMessage = messages[index-1];
            const showSenderName = chatPartner.isGroup && !isUser && (prevMessage?.senderId !== msg.senderId || index === 0);

            return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              {!isUser && chatPartner.isGroup && (
                 <Avatar className="h-8 w-8 mr-2 self-end shrink-0 opacity-0"> {/* Invisible spacer for alignment */}
                    <AvatarFallback></AvatarFallback>
                  </Avatar>
              )}
              <div className={`max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                {showSenderName && (
                  <span className="text-xs text-muted-foreground mb-0.5 ml-2">{
                    // In a real app, you'd fetch sender's name based on msg.senderId
                    messages.find(m => m.senderId === msg.senderId)?.text?.split(' ')[0] || "User"
                  }</span>
                )}
                {msg.type === 'event_missed_call' ? (
                    <div className="w-full flex justify-center my-2">
                        <div className="text-xs text-center text-muted-foreground bg-muted/70 px-3 py-1 rounded-full shadow-sm">
                            {msg.text}
                        </div>
                    </div>
                ) : (
                  <div
                    className={cn(
                      "p-2.5 rounded-lg shadow-sm text-sm break-words",
                      isUser
                        ? 'bg-chat-bubble-outgoing-background text-chat-bubble-outgoing-foreground ml-auto'
                        : 'bg-chat-bubble-incoming-background text-chat-bubble-incoming-foreground',
                      isUser ? 'rounded-br-none' : 'rounded-bl-none' // Speech bubble tail effect
                    )}
                  >
                    {msg.type === 'image' && msg.imageUrl ? (
                      <Image src={msg.imageUrl} alt="Sent image" width={300} height={200} className="rounded-md object-cover max-w-xs" data-ai-hint="chat image"/>
                    ) : msg.type === 'voice' && msg.mediaUrl ? (
                       <div className="flex items-center space-x-2 text-foreground/80">
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <Mic className="h-4 w-4" /> {/* Placeholder, should be play icon */}
                          </Button>
                          <div className="w-32 h-1 bg-muted-foreground/30 rounded-full relative">
                            {/* Placeholder for voice wave & progress */}
                            <div className="absolute left-0 top-0 h-1 bg-primary rounded-full" style={{width: `${Math.random()*80 + 10}%`}}></div>
                          </div>
                          <span className="text-xs">{msg.mediaDuration || "0:15"}</span>
                       </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                    <p className={`text-xs mt-1 ${isUser ? 'text-right text-chat-bubble-outgoing-foreground/70' : 'text-left text-chat-bubble-incoming-foreground/70'}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )})}
          <div ref={messagesEndRef} />
        </ScrollArea>

        <footer className="p-3 border-t border-border bg-card sticky bottom-0 z-10">
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary" onClick={handleAttachmentClick}>
              <Paperclip className="h-5 w-5" />
            </Button>
            <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto max-w-xs sm:max-w-sm md:max-w-md p-0 border-border shadow-xl mb-2 rounded-xl" side="top" align="start">
                <ScrollArea className="h-[250px] sm:h-[300px] p-2">
                  {Object.entries(emojiCategories).map(([category, emojis]) => (
                    <div key={category} className="mb-2">
                      <p className="text-xs font-semibold text-muted-foreground px-1 mb-1">{category}</p>
                      <div className="grid grid-cols-8 sm:grid-cols-9 md:grid-cols-10 gap-0.5">
                        {emojis.map((emoji) => (
                          <Button
                            key={emoji}
                            variant="ghost"
                            className="text-xl p-1 h-auto aspect-square hover:bg-accent/10 rounded-md"
                            onClick={() => handleEmojiSelect(emoji)}
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
            <Input
              placeholder="Your message"
              className="flex-1 rounded-full px-4 py-2.5 bg-muted/50 border-transparent focus:border-primary focus:bg-card focus-visible:ring-primary text-sm h-10"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), handleSendMessage()) : null}
            />
             {newMessage.trim() ? (
              <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground w-10 h-10 shrink-0" onClick={handleSendMessage}>
                <Send className="h-5 w-5" />
              </Button>
             ) : (
              <Button size="icon" variant="ghost" className="rounded-full text-muted-foreground hover:text-primary w-10 h-10 shrink-0" onClick={handleVoiceMessageClick}>
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
