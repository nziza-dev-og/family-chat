"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Paperclip, Send, Smile, ArrowLeft, Phone, Video, MoreVertical } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

// Mock messages
const messages = [
  { id: "1", sender: "other", text: "Hey, how are you?", time: "10:00 AM", avatar: "https://placehold.co/100x100.png", dataAiHint: "woman smiling" },
  { id: "2", sender: "me", text: "I'm good, thanks! How about you?", time: "10:01 AM" },
  { id: "3", sender: "other", text: "Doing well! Just got back from a walk.", time: "10:02 AM", avatar: "https://placehold.co/100x100.png", dataAiHint: "woman smiling" },
  { id: "4", sender: "me", text: "Nice! The weather is great today.", time: "10:03 AM" },
  { id: "5", sender: "other", text: "https://placehold.co/300x200.png", type: "image", time: "10:05 AM", avatar: "https://placehold.co/100x100.png", dataAiHint: "nature landscape" },
];

const chatPartner = {
  name: "Mom",
  avatar: "https://placehold.co/100x100.png",
  status: "Online",
  dataAiHint: "woman smiling"
};

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.chatId;

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
          <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
            {msg.sender === 'other' && (
              <Avatar className="h-8 w-8 mr-2 self-end">
                <AvatarImage src={msg.avatar} alt="Sender" data-ai-hint={msg.dataAiHint}/>
                <AvatarFallback>{chatPartner.name.substring(0,1)}</AvatarFallback>
              </Avatar>
            )}
            <div
              className={`max-w-[70%] p-3 rounded-xl shadow ${
                msg.sender === 'me'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-card text-card-foreground'
              }`}
            >
              {msg.type === 'image' && msg.text ? (
                <Image src={msg.text} alt="Sent image" width={300} height={200} className="rounded-lg" data-ai-hint={msg.dataAiHint}/>
              ) : (
                <p className="text-sm">{msg.text}</p>
              )}
              <p className={`text-xs mt-1 ${msg.sender === 'me' ? 'text-primary-foreground/70 text-right' : 'text-muted-foreground text-left'}`}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
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
          />
          <Button size="icon" className="rounded-full bg-accent hover:bg-accent/90">
            <Send className="h-5 w-5 text-accent-foreground" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
