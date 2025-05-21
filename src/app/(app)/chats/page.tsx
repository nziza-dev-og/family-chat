import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Image from "next/image";

// Mock data for chat list items
const mockChats = [
  { id: "1", name: "Mom", lastMessage: "Are you coming for dinner?", time: "5:30 PM", avatar: "https://placehold.co/100x100.png", unread: 2, dataAiHint: "woman smiling" },
  { id: "2", name: "Family Group", lastMessage: "Dad: Let's plan the trip!", time: "4:15 PM", avatar: "https://placehold.co/100x100.png", dataAiHint: "family vacation" },
  { id: "3", name: "John (Brother)", lastMessage: "Check this out!", time: "Yesterday", avatar: "https://placehold.co/100x100.png", dataAiHint: "man portrait" },
  { id: "4", name: "Grandma", lastMessage: "Love you! ❤️", time: "Mon", avatar: "https://placehold.co/100x100.png", dataAiHint: "grandmother" },
];


export default function ChatListPage() {
  return (
    <div className="flex flex-col h-full">
      <CardHeader className="px-0 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Chats</CardTitle>
          <Button variant="ghost" size="icon">
            <PlusCircle className="h-6 w-6 text-primary" />
            <span className="sr-only">New Chat</span>
          </Button>
        </div>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input placeholder="Search chats..." className="pl-10" />
        </div>
      </CardHeader>
      
      <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 lg:-mx-8">
        {mockChats.map((chat) => (
          <Card key={chat.id} className="mb-2 shadow-none border-0 border-b rounded-none hover:bg-secondary/50 cursor-pointer">
            <CardContent className="p-3 flex items-center space-x-3">
              <Image 
                src={chat.avatar} 
                alt={chat.name} 
                width={48} 
                height={48} 
                className="rounded-full"
                data-ai-hint={chat.dataAiHint}
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <p className="font-semibold truncate">{chat.name}</p>
                  <p className="text-xs text-muted-foreground">{chat.time}</p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
                  {chat.unread > 0 && (
                    <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
