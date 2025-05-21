
import { db, storage, auth } from "@/lib/firebase";
import { 
  collection, addDoc, serverTimestamp, query, where, getDocs, 
  orderBy, Timestamp, doc, getDoc, DocumentData 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

export interface StatusDisplay {
  id: string;
  userId: string;
  userName?: string | null;
  userAvatar?: string | null;
  type: 'text' | 'image';
  content: string; // text or imageURL
  caption?: string; // Optional caption for image/video statuses
  createdAt: Timestamp; // Firestore Timestamp
  expiresAt: Timestamp; // Firestore Timestamp
  dataAiHint?: string;
}

export interface UserStatusGroup {
  userId:string;
  userName?: string | null;
  userAvatar?: string | null;
  statuses: StatusDisplay[];
  lastStatusTime?: string; // Formatted time of the latest status in the group
  dataAiHint?: string;
}


async function getUserData(userId: string): Promise<{ displayName?: string | null; photoURL?: string | null; uid: string }> {
  const userDocRef = doc(db, "users", userId);
  const userDocSnap = await getDoc(userDocRef);
  if (userDocSnap.exists()) {
    const data = userDocSnap.data();
    return { 
      uid: data.uid, 
      displayName: data.displayName || "Anonymous", 
      photoURL: data.photoURL || "https://placehold.co/100x100.png" 
    };
  }
  return { uid: userId, displayName: "Anonymous", photoURL: "https://placehold.co/100x100.png" };
}

export async function addTextStatus(userId: string, text: string): Promise<void> {
  const statusesColRef = collection(db, "statuses");
  const expirationDate = new Date();
  expirationDate.setHours(expirationDate.getHours() + 24); // Expires in 24 hours

  const userData = await getUserData(userId);

  await addDoc(statusesColRef, {
    userId,
    userName: userData.displayName,
    userAvatar: userData.photoURL,
    type: 'text',
    content: text,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expirationDate),
  });
}

export async function addImageStatus(userId: string, file: File, caption?: string): Promise<void> {
  if (!userId || !file) throw new Error("User ID and file are required.");

  const filePath = `statusImages/${userId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, filePath);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  const statusesColRef = collection(db, "statuses");
  const expirationDate = new Date();
  expirationDate.setHours(expirationDate.getHours() + 24);
  
  const userData = await getUserData(userId);

  const statusData: any = {
    userId,
    userName: userData.displayName,
    userAvatar: userData.photoURL,
    type: 'image',
    content: downloadURL,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expirationDate),
  };

  if (caption && caption.trim() !== "") {
    statusData.caption = caption.trim();
  }

  await addDoc(statusesColRef, statusData);
}

// Fetches statuses for a list of user IDs (currentUser + friends)
export async function getStatusesForUserList(currentUserAndFriendUIDs: string[]): Promise<UserStatusGroup[]> {
  if (currentUserAndFriendUIDs.length === 0) return [];

  const statusesColRef = collection(db, "statuses");
  const now = Timestamp.now();
  
  const userStatusMap: Map<string, UserStatusGroup> = new Map();

  // Firestore 'in' query limit is 30. Chunking for safety.
  // The query below might require a composite index in Firestore. 
  // If you see errors related to indexing, please create the index in your Firebase console.
  const chunkSize = 30;
  for (let i = 0; i < currentUserAndFriendUIDs.length; i += chunkSize) {
    const chunk = currentUserAndFriendUIDs.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    const q = query(
        statusesColRef,
        where("userId", "in", chunk),
        where("expiresAt", ">", now),
        orderBy("userId"), // Group by user first
        orderBy("createdAt", "desc") // Then by time for each user's statuses
    );

    const statusSnap = await getDocs(q);

    for (const docSnap of statusSnap.docs) {
        const data = docSnap.data() as DocumentData; 
        const statusItem: StatusDisplay = {
            id: docSnap.id,
            userId: data.userId,
            userName: data.userName,
            userAvatar: data.userAvatar,
            type: data.type,
            content: data.content,
            caption: data.caption, // Add caption here
            createdAt: data.createdAt as Timestamp,
            expiresAt: data.expiresAt as Timestamp,
            dataAiHint: data.type === 'image' ? 'status image' : undefined,
        };

        if (!userStatusMap.has(data.userId)) {
            userStatusMap.set(data.userId, {
                userId: data.userId,
                userName: data.userName,
                userAvatar: data.userAvatar,
                statuses: [],
                dataAiHint: "person portrait" 
            });
        }
        userStatusMap.get(data.userId)!.statuses.push(statusItem);
    }
  }
  
  userStatusMap.forEach(group => {
    if (group.statuses.length > 0) {
      group.statuses.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      group.lastStatusTime = formatStatusTimestamp(group.statuses[0].createdAt.toDate());
    }
  });

  return Array.from(userStatusMap.values());
}


// Helper to format timestamp for status display
export function formatStatusTimestamp(date: Date): string {
  if (!date) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);

  if (diffSecs < 5) return "Just now";
  if (diffSecs < 60) return `${diffSecs} seconds ago`;
  if (diffMins < 60) return `${diffMins} minutes ago`;
  
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const statusDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - statusDateOnly.getTime()) / (1000 * 60 * 60 * 24));

  if (diffHours < today.getHours() && diffDays === 0) { // Same day, less than `now.getHours()` ago
    return `${diffHours} hours ago`;
  }
  
  if (diffDays === 0) { // Today
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // Fallback for older dates, though statuses expire in 24h
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
