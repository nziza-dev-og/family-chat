
"use client";

import { Button } from "@/components/ui/button";
import { PlusCircle, Search, Loader2, MessageSquarePlus, MessageSquareText } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { getAllUsers, addFriend, getOrCreateChatWithUser, getUserChats, type ChatUser, type ChatListItem } from "@/lib/chatActions";
import { cn } from "@/lib/utils";

function ChatListPanel() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const currentChatId = params?.chatId as string | undefined;
  const { toast } = useToast();

  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [allOtherUsers, setAllOtherUsers] = useState<ChatUser[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchChatTerm, setSearchChatTerm] = useState("");

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
      setAllOtherUsers(users);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast({ title: "Error", description: "Could not load users to add.", variant: "destructive" });
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleAddAndChat = async (friend: ChatUser) => {
    if (!user || !friend.uid) return;
    try {
      await addFriend(user.uid, friend.uid);
      toast({ title: "Friend Added", description: `${friend.displayName} is now your friend. You can see each other's statuses.` });
      
      const newChatId = await getOrCreateChatWithUser(user.uid, friend.uid);
      setIsAddUserModalOpen(false);
      setSearchTerm("");
      // Optimistically add to chat list or refresh
      const newChatListItem: ChatListItem = {
        id: newChatId,
        name: friend.displayName,
        avatar: friend.photoURL,
        dataAiHint: "person portrait",
        isGroup: false,
        otherUserId: friend.uid,
        lastMessage: "Chat started",
        time: "Now"
      };
      setChats(prev => [newChatListItem, ...prev.filter(c => c.id !== newChatId)]);
      router.push(`/chats/${newChatId}`);
    } catch (error: any) {
      console.error("Failed to add friend or start chat:", error);
      toast({ title: "Error", description: error.message || "Could not start chat.", variant: "destructive" });
    }
  };

  const filteredUsers = searchTerm
    ? allOtherUsers.filter(u => u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase()))
    : allOtherUsers;

  const filteredChats = searchChatTerm
    ? chats.filter(chat => chat.name?.toLowerCase().includes(searchChatTerm.toLowerCase()))
    : chats;

  if (authLoading) {
    return (
      <div className="w-full md:w-[320px] lg:w-[360px] border-r border-border bg-card p-4 flex flex-col items-center justify-center h-full">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-3 text-muted-foreground">Loading chats...</p>
      </div>
    );
  }
  
  return (
    <div className={cn(
        "w-full md:w-[320px] lg:w-[360px] border-r border-border bg-card flex-col h-full overflow-y-auto",
        currentChatId ? "hidden md:flex" : "flex" 
      )}>
      <div className="p-4 sticky top-0 bg-card z-10 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-semibold text-foreground">Chats</h1>
          <Dialog open={isAddUserModalOpen} onOpenChange={(isOpen) => {
            setIsAddUserModalOpen(isOpen);
            if (!isOpen) setSearchTerm(""); 
          }}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" onClick={handleOpenAddUserModal} className="text-primary hover:bg-primary/10">
                <MessageSquarePlus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Start a new chat</DialogTitle>
                <DialogDescription>Select a user to start a conversation with.</DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Input 
                  placeholder="Search users by name or email..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-4"
                />
                {isLoadingUsers ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    {filteredUsers.length > 0 ? filteredUsers.map((u) => (
                      <div 
                        key={u.uid} 
                        className="flex items-center space-x-3 p-2.5 rounded-lg hover:bg-secondary cursor-pointer transition-colors"
                        onClick={() => handleAddAndChat(u)}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={u.photoURL || undefined} alt={u.displayName || "User"} data-ai-hint="person portrait" />
                          <AvatarFallback className="bg-muted text-muted-foreground">{u.displayName?.substring(0,1).toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm text-card-foreground">{u.displayName}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    )) : <p className="text-center text-sm text-muted-foreground py-4">No users found.</p>}
                  </ScrollArea>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search or start new chat" 
            className="pl-10 rounded-full h-10 bg-secondary border-transparent focus:bg-card focus:border-primary"
            value={searchChatTerm}
            onChange={(e) => setSearchChatTerm(e.target.value)}
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {isLoadingChats ? (
            <div className="p-4 text-center text-muted-foreground">Loading chats...</div>
          ) : filteredChats.length > 0 ? filteredChats.map((chat) => (
            <Link href={`/chats/${chat.id}`} key={chat.id} passHref
                  className={cn(
                    "block hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none",
                    currentChatId === chat.id && "bg-secondary"
                  )}>
              <div className="p-3.5 flex items-center space-x-3.5 cursor-pointer">
                <Avatar className="h-11 w-11">
                  <AvatarImage 
                    src={chat.avatar || "https://placehold.co/100x100.png"} 
                    alt={chat.name || "Chat"}
                    data-ai-hint={chat.dataAiHint || "person"}
                  />
                  <AvatarFallback className="bg-muted text-muted-foreground">{chat.name?.substring(0,1).toUpperCase() || "C"}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="font-medium text-sm text-card-foreground truncate">{chat.name}</p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">{chat.time}</p>
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{chat.lastMessage}</p>
                    {chat.unread !== undefined && chat.unread > 0 && (
                      <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold px-1.5 py-0.5 rounded-full h-5 min-w-[1.25rem] flex items-center justify-center text-[10px]">
                        {chat.unread > 9 ? '9+' : chat.unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          )) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <MessageSquareText className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No chats yet</p>
              <p className="text-xs text-muted-foreground">Start a new conversation to see it here.</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function ChatsPageContainer() {
  const params = useParams();
  const currentChatId = params?.chatId as string | undefined;

  return (
    <>
      <ChatListPanel />
      {!currentChatId && (
        <div className="flex-1 items-center justify-center bg-chat-background-color p-4 hidden md:flex">
          <div className="text-center text-muted-foreground">
            <MessageSquareText size={64} className="mx-auto mb-6 text-primary/30" />
            <p className="text-xl font-medium text-foreground">Select a chat to start messaging</p>
            <p className="text-sm">or click the <MessageSquarePlus className="inline h-4 w-4 mx-0.5"/> icon to start a new conversation.</p>
          </div>
        </div>
      )}
    </>
  );
}
