
import { db, auth } from "@/lib/firebase";
import { 
  collection, doc, getDoc, getDocs, updateDoc, 
  arrayUnion, query, where, serverTimestamp, setDoc, DocumentData, orderBy, limit, startAfter, QueryDocumentSnapshot, collectionGroup, onSnapshot, addDoc
} from "firebase/firestore";
import type { User as FirebaseUserType } from "firebase/auth"; // Renamed to avoid conflict

export interface ChatUser {
  uid: string; // Changed from id to uid for consistency with Firestore user documents
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
}

export interface ChatListItem {
  id: string; // Chat ID
  name?: string | null; // Other user's name or group name
  lastMessage?: string | null;
  time?: string | null; // Formatted time of last message
  avatar?: string | null; // Other user's avatar or group avatar
  unread?: number;
  dataAiHint?: string;
  participants?: string[];
  isGroup?: boolean;
  otherUserId?: string; // For 1-on-1 chats
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
  
  // Firestore 'in' query limit is 30. If more friends, needs multiple queries or different data model.
  // For this version, we assume friends count is manageable.
  if (friendUIDs.length > 30) {
    console.warn("User has more than 30 friends, fetching only the first 30 for chat list display.");
    // Potentially implement pagination or chunking for large friend lists in a real app.
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
    // Exclude current user by uid
    const q = query(usersColRef, where("uid", "!=", currentUserId));
    const usersSnap = await getDocs(q);
    return usersSnap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
            uid: data.uid, // Ensure uid is mapped
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

    // Add friendId to current user's friends list
    await updateDoc(currentUserDocRef, {
        friends: arrayUnion(friendId)
    });

    // Add currentUserId to friend's friends list (for a two-way friendship)
    // In a real app, this would be part of a friend request/acceptance flow.
    await updateDoc(friendUserDocRef, {
        friends: arrayUnion(currentUserId)
    });
}

export async function getOrCreateChatWithUser(currentUserId: string, otherUserId: string): Promise<string> {
  const sortedUserIds = [currentUserId, otherUserId].sort();
  const chatIdComposite = sortedUserIds.join('_'); // e.g., uid1_uid2

  const chatDocRef = doc(db, "chats", chatIdComposite);
  const chatDocSnap = await getDoc(chatDocRef);

  if (chatDocSnap.exists()) {
    return chatDocSnap.id;
  } else {
    // Fetch other user's details to potentially store in participantInfo
    // const otherUserDocRef = doc(db, "users", otherUserId);
    // const otherUserDocSnap = await getDoc(otherUserDocRef);
    // const otherUserDetails = otherUserDocSnap.exists() ? otherUserDocSnap.data() : { displayName: "User", photoURL: null };

    await setDoc(chatDocRef, {
      participants: sortedUserIds,
      isGroup: false,
      createdAt: serverTimestamp(),
      lastMessage: null,
      lastMessageTimestamp: null,
      // participantInfo: { // Optional: denormalize for quick display
      //   [currentUserId]: { displayName: auth.currentUser?.displayName, photoURL: auth.currentUser?.photoURL },
      //   [otherUserId]: { displayName: otherUserDetails.displayName, photoURL: otherUserDetails.photoURL }
      // }
    });
    // Also create a messages subcollection
    // const messagesColRef = collection(chatDocRef, "messages");
    // console.log(`Created new chat ${chatDocRef.id} and messages subcollection`);
    return chatDocRef.id;
  }
}

// Function to fetch chat list items for the current user
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
      time: chatData.lastMessageTimestamp ? formatTimestamp(chatData.lastMessageTimestamp.toDate()) : "",
      unread: chatData.unreadCount?.[userId] || 0, // Example: unread count per user
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

// Helper to format timestamp
function formatTimestamp(date: Date): string {
  if (!date) return "";
  // Simple time formatting, can be expanded (e.g., using date-fns)
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
  _originalCallerId: string, // Not used in message text but kept for context
  calleeWhoMissedId: string
): Promise<void> {
  if (!chatId || !calleeWhoMissedId) {
    console.error("chatId and calleeWhoMissedId are required for missed call message");
    return;
  }

  const messageText = `Missed ${callType} call`;
  const messagesColRef = collection(db, "chats", chatId, "messages");
  const chatDocRef = doc(db, "chats", chatId);

  try {
    await addDoc(messagesColRef, {
      senderId: calleeWhoMissedId, // Message attributed to the person who missed the call
      text: messageText,
      timestamp: serverTimestamp(),
      type: 'event_missed_call', // Special type for potential distinct styling
    });
    await updateDoc(chatDocRef, {
      lastMessage: { text: messageText, senderId: calleeWhoMissedId },
      lastMessageTimestamp: serverTimestamp(),
    });
    console.log(`Added missed call message to chat ${chatId}`);
  } catch (error) {
    console.error("Error adding missed call message:", error);
  }
}
