
import { db, auth } from "@/lib/firebase";
import { 
  collection, doc, getDoc, getDocs, updateDoc, 
  arrayUnion, query, where, serverTimestamp, setDoc, DocumentData, orderBy, limit, startAfter, QueryDocumentSnapshot, collectionGroup, onSnapshot, addDoc, Timestamp
} from "firebase/firestore"; // Added Timestamp
import type { User as FirebaseUserType } from "firebase/auth"; 

export interface ChatUser {
  uid: string; 
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
}

export interface ChatListItem {
  id: string; 
  name?: string | null; 
  lastMessage?: string | null;
  time?: string | null; 
  avatar?: string | null; 
  unread?: number;
  dataAiHint?: string;
  participants?: string[];
  isGroup?: boolean;
  otherUserId?: string; 
}


export async function getFriends(userId: string): Promise<ChatUser[]> {
  const userDocRef = doc(db, "users", userId);
  const userDocSnap = await getDoc(userDocRef);

  if (!userDocSnap.exists()) {
    console.error("No such user for getFriends!");
    return [];
  }

  const userData = userDocSnap.data();
  const friendUIDs = userData?.friends || [];

  if (friendUIDs.length === 0) {
    return [];
  }
  
  if (friendUIDs.length > 30) {
    console.warn("User has more than 30 friends, fetching only the first 30 for chat list display.");
  }
  const q = query(collection(db, "users"), where("uid", "in", friendUIDs.slice(0,30)));
  
  const friendsSnap = await getDocs(q);
  
  return friendsSnap.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      uid: data.uid,
      displayName: data.displayName,
      photoURL: data.photoURL,
      email: data.email,
    } as ChatUser;
  });
}

export async function getAllUsers(currentUserId: string): Promise<ChatUser[]> {
    const usersColRef = collection(db, "users");
    const q = query(usersColRef, where("uid", "!=", currentUserId));
    const usersSnap = await getDocs(q);
    return usersSnap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            uid: data.uid, 
            displayName: data.displayName,
            photoURL: data.photoURL,
            email: data.email,
        } as ChatUser;
    });
}

export async function addFriend(currentUserId: string, friendId: string): Promise<void> {
    if (currentUserId === friendId) throw new Error("Cannot add yourself as a friend.");
    
    const currentUserDocRef = doc(db, "users", currentUserId);
    const friendUserDocRef = doc(db, "users", friendId);

    await updateDoc(currentUserDocRef, {
        friends: arrayUnion(friendId)
    });

    await updateDoc(friendUserDocRef, {
        friends: arrayUnion(currentUserId)
    });
}

export async function getOrCreateChatWithUser(currentUserId: string, otherUserId: string): Promise<string> {
  const sortedUserIds = [currentUserId, otherUserId].sort();
  const chatIdComposite = sortedUserIds.join('_'); 

  const chatDocRef = doc(db, "chats", chatIdComposite);
  const chatDocSnap = await getDoc(chatDocRef);

  if (chatDocSnap.exists()) {
    return chatDocSnap.id;
  } else {
    await setDoc(chatDocRef, {
      participants: sortedUserIds,
      isGroup: false,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageTimestamp: null,
    });
    return chatDocRef.id;
  }
}

export async function getUserChats(userId: string): Promise<ChatListItem[]> {
  const chatsRef = collection(db, "chats");
  const q = query(chatsRef, where("participants", "array-contains", userId), orderBy("lastMessageTimestamp", "desc"));
  
  const querySnapshot = await getDocs(q);
  const chatListItems: ChatListItem[] = [];

  for (const chatDoc of querySnapshot.docs) {
    const chatData = chatDoc.data();
    let chatListItem: Partial<ChatListItem> = {
      id: chatDoc.id,
      lastMessage: chatData.lastMessage?.text || "No messages yet",
      time: chatData.lastMessageTimestamp ? formatFirebaseTimestamp(chatData.lastMessageTimestamp) : "", // Use formatFirebaseTimestamp
      unread: chatData.unreadCount?.[userId] || 0, 
      participants: chatData.participants,
      isGroup: chatData.isGroup || false,
    };

    if (chatData.isGroup) {
      chatListItem.name = chatData.groupName || "Group Chat";
      chatListItem.avatar = chatData.groupAvatar || "https://placehold.co/100x100.png";
      chatListItem.dataAiHint = "group people";
    } else {
      const otherUserId = chatData.participants.find((pId: string) => pId !== userId);
      if (otherUserId) {
        chatListItem.otherUserId = otherUserId;
        const userDocRef = doc(db, "users", otherUserId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const partnerData = userDocSnap.data();
          chatListItem.name = partnerData.displayName || "User";
          chatListItem.avatar = partnerData.photoURL || "https://placehold.co/100x100.png";
          chatListItem.dataAiHint = "person portrait";
        } else {
          chatListItem.name = "User";
          chatListItem.avatar = "https://placehold.co/100x100.png";
          chatListItem.dataAiHint = "person portrait";
        }
      }
    }
    chatListItems.push(chatListItem as ChatListItem);
  }
  return chatListItems;
}

// Helper to format Firestore timestamp
function formatFirebaseTimestamp(timestamp: Timestamp | null): string {
  if (!timestamp) return "";
  const date = timestamp.toDate(); // Convert Firestore Timestamp to JavaScript Date
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

export async function addMissedCallMessage(
  chatId: string, 
  callType: 'audio' | 'video', 
  originalCallerId: string, 
  calleeWhoMissedId: string
): Promise<void> {
  if (!chatId || !calleeWhoMissedId || !originalCallerId) { // Ensure originalCallerId is also checked
    console.error("chatId, originalCallerId, and calleeWhoMissedId are required for missed call message. chatId:", chatId, "callerId:", originalCallerId, "calleeId:", calleeWhoMissedId);
    return;
  }

  const messageText = `Missed ${callType} call`;
  const messagesColRef = collection(db, "chats", chatId, "messages");
  const chatDocRef = doc(db, "chats", chatId);

  try {
    await addDoc(messagesColRef, {
      senderId: calleeWhoMissedId, 
      text: messageText,
      timestamp: serverTimestamp(),
      type: 'event_missed_call', 
      // Optionally, store who initiated the call for context if needed later
      // originalCallerId: originalCallerId 
    });
    await updateDoc(chatDocRef, {
      lastMessage: { text: messageText, senderId: calleeWhoMissedId },
      lastMessageTimestamp: serverTimestamp(),
    });
    console.log(`Added missed call message to chat ${chatId}. Caller: ${originalCallerId}, Missed by: ${calleeWhoMissedId}`);
  } catch (error) {
    console.error("Error adding missed call message:", error);
  }
}
