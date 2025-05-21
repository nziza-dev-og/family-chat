
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, UserPlus, Loader2, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { getAllUsers, addFriend, getOrCreateChatWithUser, getUserChats, type ChatUser, type ChatListItem } from "@/lib/chatActions";


export default function ChatListPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [allOtherUsers, setAllOtherUsers] = useState<ChatUser[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (user && !authLoading) {
      const fetchChats = async () => {
        setIsLoadingChats(true);
        try {
          const userChatItems = await getUserChats(user.uid);
          setChats(userChatItems);
        } catch (error) {
          console.error("Failed to fetch chats:", error);
          toast({ title: "Error", description: "Could not load your chats.", variant: "destructive" });
        } finally {
          setIsLoadingChats(false);
        }
      };
      fetchChats();
    }
  }, [user, authLoading, toast]);

  const handleOpenAddUserModal = async () => {
    if (!user) return;
    setIsLoadingUsers(true);
    setIsAddUserModalOpen(true);
    try {
      const users = await getAllUsers(user.uid);
      // Filter out users already in chats (or friends) to simplify - more robust logic can be added
      const currentFriendOrChattedUserIds = new Set(chats.map(c => c.otherUserId).filter(Boolean));
      const availableUsers = users.filter(u => !currentFriendOrChattedUserIds.has(u.uid));
      setAllOtherUsers(availableUsers);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast({ title: "Error", description: "Could not load users to add.", variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleAddAndChat = async (friend: ChatUser) => {
    if (!user) return;
    try {
      // For simplicity, directly add as friend. A real app would have requests.
      // await addFriend(user.uid, friend.uid); 
      // toast({ title: "Friend Added", description: `${friend.displayName} is now your friend.` });
      
      const chatId = await getOrCreateChatWithUser(user.uid, friend.uid);
      setIsAddUserModalOpen(false);
      router.push(`/chats/${chatId}`);
    } catch (error: any) {
      console.error("Failed to add friend or start chat:", error);
      toast({ title: "Error", description: error.message || "Could not start chat.", variant: "destructive" });
    }
  };

  const filteredUsers = searchTerm
    ? allOtherUsers.filter(u => u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()))
    : allOtherUsers;

  if (authLoading || isLoadingChats) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading chats...</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <CardHeader className="px-0 py-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-2xl">Chats</CardTitle>
          <Dialog open={isAddUserModalOpen} onOpenChange={setIsAddUserModalOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleOpenAddUserModal}>
                <MessageSquarePlus className="h-6 w-6 text-primary" />
                <span className="sr-only">New Chat</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Start a new chat</DialogTitle>
                <DialogDescription>Select a user to start a conversation with.</DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Input 
                  placeholder="Search users..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-4"
                />
                {isLoadingUsers ? (
                  <div className="flex justify-center items-center h-32">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    {filteredUsers.length > 0 ? filteredUsers.map((u) => (
                      <div 
                        key={u.uid} 
                        className="flex items-center space-x-3 p-2 rounded-md hover:bg-secondary cursor-pointer"
                        onClick={() => handleAddAndChat(u)}
                      >
                        <Avatar>
                          <AvatarImage src={u.photoURL || undefined} alt={u.displayName || "User"} data-ai-hint="person portrait" />
                          <AvatarFallback>{u.displayName?.substring(0,1) || "U"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold">{u.displayName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    )) : <p className="text-center text-muted-foreground">No users found.</p>}
                  </ScrollArea>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {/* Search chats functionality can be added later */}
        {/* <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input placeholder="Search chats..." className="pl-10" />
        </div> */}
      </CardHeader>
      
      <div className="flex-1 overflow-y-auto -mx-4 sm:-mx-6 lg:-mx-8">
        {chats.length > 0 ? chats.map((chat) => (
          <Link href={`/chats/${chat.id}`} key={chat.id} passHref>
            <Card className="mb-0 shadow-none border-0 border-b rounded-none hover:bg-secondary/50 cursor-pointer">
              <CardContent className="p-3 flex items-center space-x-3">
                <Image 
                  src={chat.avatar || "https://placehold.co/100x100.png"} 
                  alt={chat.name || "Chat"} 
                  width={48} 
                  height={48} 
                  className="rounded-full"
                  data-ai-hint={chat.dataAiHint || "person"}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold truncate">{chat.name}</p>
                    <p className="text-xs text-muted-foreground">{chat.time}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground truncate">{chat.lastMessage}</p>
                    {chat.unread && chat.unread > 0 && (
                      <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                        {chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
             <MessageSquarePlus className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold">No chats yet</p>
            <p className="text-muted-foreground">Start a new conversation by clicking the button above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
