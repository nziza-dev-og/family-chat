
"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Send, Smile, ArrowLeft, Phone, Video, MoreVertical, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, Timestamp, updateDoc, arrayUnion, where, getDocs } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  senderId: string;
  text?: string;
  imageUrl?: string;
  timestamp: Timestamp;
  type?: 'text' | 'image';
}

interface ChatPartner {
  uid: string;
  name: string;
  avatar: string;
  status?: string; // e.g., "Online", "Offline" - needs presence system
  dataAiHint: string;
}

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
            // Handle group chat details if implemented
             setChatPartner({
                uid: chatId, // Group ID
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
      // Update last message on chat document
      await updateDoc(chatDocRef, {
        lastMessage: { text: newMessage, senderId: user.uid },
        lastMessageTimestamp: serverTimestamp(),
        // Potentially update unread counts for other participants here
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

  if (authLoading || isLoading || !chatPartner) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-var(--header-height,0px)-2rem)] md:max-h-[calc(100vh-2rem)]">
      {/* Chat Header */}
      <header className="flex items-center p-3 border-b bg-card sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="mr-2 md:hidden" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10 mr-3">
          <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint} />
          <AvatarFallback>{chatPartner.name.substring(0,1)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="font-semibold">{chatPartner.name}</h2>
          <p className="text-xs text-muted-foreground">{chatPartner.status}</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background/70">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.senderId === user?.uid ? 'justify-end' : 'justify-start'}`}>
            {msg.senderId !== user?.uid && chatPartner && (
              <Avatar className="h-8 w-8 mr-2 self-end">
                <AvatarImage src={chatPartner.avatar} alt={chatPartner.name} data-ai-hint={chatPartner.dataAiHint}/>
                <AvatarFallback>{chatPartner.name.substring(0,1)}</AvatarFallback>
              </Avatar>
            )}
            <div
              className={`max-w-[70%] p-3 rounded-xl shadow ${
                msg.senderId === user?.uid
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-card text-card-foreground'
              }`}
            >
              {msg.type === 'image' && msg.imageUrl ? (
                <Image src={msg.imageUrl} alt="Sent image" width={300} height={200} className="rounded-lg" data-ai-hint="chat image"/>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              )}
              <p className={`text-xs mt-1 ${msg.senderId === user?.uid ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground text-left'}`}>
                {formatTime(msg.timestamp)}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Footer */}
      <footer className="p-3 border-t bg-card sticky bottom-0 z-10">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon">
            <Smile className="h-6 w-6 text-muted-foreground hover:text-primary" />
          </Button>
          <Button variant="ghost" size="icon">
            <Paperclip className="h-6 w-6 text-muted-foreground hover:text-primary" />
          </Button>
          <Input
            placeholder="Type a message..."
            className="flex-1 rounded-full px-4 py-2 focus-visible:ring-primary"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey ? (e.preventDefault(), handleSendMessage()) : null}
          />
          <Button size="icon" className="rounded-full bg-accent hover:bg-accent/90" onClick={handleSendMessage} disabled={!newMessage.trim()}>
            <Send className="h-5 w-5 text-accent-foreground" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
