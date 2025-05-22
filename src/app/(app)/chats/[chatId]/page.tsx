
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Send, Smile, ArrowLeft, Phone, Video, MoreVertical, Loader2, GripHorizontal } from "lucide-react";
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

interface Message {
  id: string;
  senderId: string;
  text?: string;
  imageUrl?: string;
  timestamp: Timestamp;
  type?: 'text' | 'image' | 'event_missed_call';
}

interface ChatPartner {
  uid: string;
  name: string;
  avatar: string;
  status?: string;
  dataAiHint: string;
}

const emojiCategories = {
  "Smileys & People": ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠", "😈", "👿", "👍", "👎", "👌", "🤏", "👈", "👉", "👆", "👇", "👋", "🤚", "🖐", "🖖", "❤️", "💔", "🎉", "✨", "🔥", "🙏"],
  "Animals & Nature": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐈‍⬛", "🌲", "🌳", "🌴", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻", "🌼", "🌞", "🌛", "⭐"],
  "Food & Drink": ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🥗", "🥘", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯", "🥛", "🍼", "☕", "🍵", "🧃", "🥤", "🍶", "🍺", "🍻", "🥂", "🍷", "🥃", "🍸", "🍹", "🧉", "🍾", "🧊", "🥄", "🍴", "🍽️", "🥣", "🥡", "🥢", "🧂"],
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


  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!user || !chatId) return;
    setIsLoading(true);

    const fetchChatDetails = async () => {
      try {
        const chatDocRef = doc(db, "chats", chatId);
        const chatDocSnap = await getDoc(chatDocRef);

        if (chatDocSnap.exists()) {
          const chatData = chatDocSnap.data();
          const partnerId = chatData.participants.find((pId: string) => pId !== user.uid);
          if (partnerId) {
            const userDocRef = doc(db, "users", partnerId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              const partnerData = userDocSnap.data();
              setChatPartner({
                uid: partnerId,
                name: partnerData.displayName || "Chat User",
                avatar: partnerData.photoURL || "https://placehold.co/100x100.png",
                status: "Online", // Placeholder
                dataAiHint: "person portrait"
              });
            }
          } else if (chatData.isGroup) {
             setChatPartner({
                uid: chatId,
                name: chatData.groupName || "Group Chat",
                avatar: chatData.groupAvatar || "https://placehold.co/100x100.png",
                status: `${chatData.participants.length} members`,
                dataAiHint: "group people"
              });
          }
        } else {
          toast({title: "Error", description: "Chat not found.", variant: "destructive"});
          router.replace("/chats");
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
    // Consider keeping picker open for multiple emoji selections, or close as is:
    // setIsEmojiPickerOpen(false);
  };

  const handleGifButtonClick = () => {
    toast({
      title: "Coming Soon!",
      description: "GIF selection functionality will be added in a future update.",
    });
  };

  if (authLoading || isLoading || !chatPartner) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-var(--header-height,0px)-2rem)] md:max-h-[calc(100vh-2rem)] bg-card">
      <header className="flex items-center p-3 border-b bg-primary text-primary-foreground sticky top-0 z-10 shadow-sm">
        <Button variant="ghost" size="icon" className="mr-2 md:hidden text-primary-foreground hover:bg-primary/80" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10 mr-3 border-2 border-white/50">
          <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
          <AvatarFallback className="bg-secondary text-secondary-foreground">{chatPartner.name.substring(0,1)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="font-semibold">{chatPartner.name}</h2>
          <p className="text-xs text-primary-foreground/80">{chatPartner.status}</p>
        </div>
        <div className="flex items-center space-x-1">
          <Link href={`/call/audio/${chatId}`} passHref>
            <Button variant="ghost" size="icon" aria-label="Start audio call" className="text-primary-foreground hover:bg-primary/80">
              <Phone className="h-5 w-5" />
            </Button>
          </Link>
          <Link href={`/videocall?initialRoomId=${chatId}`} passHref>
            <Button variant="ghost" size="icon" aria-label="Start video call" className="text-primary-foreground hover:bg-primary/80">
              <Video className="h-5 w-5" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" aria-label="More options" className="text-primary-foreground hover:bg-primary/80">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 chat-bg"> {/* Added chat-bg class */}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
            {msg.senderId !== user?.uid && chatPartner && msg.type !== 'event_missed_call' && (
              <Avatar className="h-8 w-8 mr-2 self-end shrink-0">
                <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint}/>
                <AvatarFallback className="bg-muted text-muted-foreground">{chatPartner.name.substring(0,1)}</AvatarFallback>
              </Avatar>
            )}
            {msg.type === 'event_missed_call' ? (
                <div className="w-full flex justify-center my-2">
                    <div className="text-xs text-center text-muted-foreground bg-muted/70 px-3 py-1 rounded-full shadow-sm">
                        {msg.text}
                    </div>
                </div>
            ) : (
              <div
                className={`max-w-[70%] p-2.5 rounded-lg shadow-sm text-sm ${
                  msg.senderId === user?.uid
                    ? 'bg-chat-bubble-outgoing-background text-chat-bubble-outgoing-foreground ml-auto'
                    : 'bg-chat-bubble-incoming-background text-chat-bubble-incoming-foreground'
                }`}
              >
                {msg.type === 'image' && msg.imageUrl ? (
                  <Image src={msg.imageUrl} alt="Sent image" width={300} height={200} className="rounded-md object-cover" data-ai-hint="chat image"/>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                )}
                <p className={`text-xs mt-1.5 ${msg.senderId === user?.uid ? 'text-right text-chat-bubble-outgoing-foreground/70' : 'text-left text-chat-bubble-incoming-foreground/70'}`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            )}
             {msg.senderId === user?.uid && msg.type !== 'event_missed_call' && (
                 <Avatar className="h-8 w-8 ml-2 self-end shrink-0">
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "You"} data-ai-hint="person portrait"/>
                    <AvatarFallback className="bg-primary text-primary-foreground">{user.displayName?.substring(0,1) || "Y"}</AvatarFallback>
                </Avatar>
             )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <footer className="p-3 border-t bg-background sticky bottom-0 z-10">
        <div className="flex items-center space-x-2">
          <Popover open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon">
                <Smile className="h-6 w-6 text-muted-foreground hover:text-primary" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto max-w-xs sm:max-w-sm md:max-w-md p-0 border-none shadow-xl mb-2" side="top" align="start">
              <ScrollArea className="h-[250px] sm:h-[300px] p-2">
                {Object.entries(emojiCategories).map(([category, emojis]) => (
                  <div key={category} className="mb-2">
                    <p className="text-xs font-semibold text-muted-foreground px-1 mb-1">{category}</p>
                    <div className="grid grid-cols-7 sm:grid-cols-8 md:grid-cols-9 gap-0.5">
                      {emojis.map((emoji) => (
                        <Button
                          key={emoji}
                          variant="ghost"
                          className="text-xl p-1 h-auto aspect-square hover:bg-accent/50"
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
          <Button variant="ghost" size="icon" onClick={handleGifButtonClick}>
            <GripHorizontal className="h-6 w-6 text-muted-foreground hover:text-primary" /> {/* Placeholder GIF icon */}
          </Button>
          <Button variant="ghost" size="icon">
            <Paperclip className="h-6 w-6 text-muted-foreground hover:text-primary" />
          </Button>
          <Input
            placeholder="Type a message..."
            className="flex-1 rounded-full px-4 py-2.5 focus-visible:ring-primary bg-input text-sm"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), handleSendMessage()) : null}
          />
          <Button size="icon" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground w-10 h-10" onClick={handleSendMessage} disabled={!newMessage.trim()}>
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
}

    