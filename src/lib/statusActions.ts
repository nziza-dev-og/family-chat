
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
  type: 'text' | 'image' | 'video'; // Added 'video'
  content: string; // text or mediaURL
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

export async function addMediaStatus(
  userId: string, 
  media: File | string, // File for upload, string for direct URL (images only for URL)
  mediaType: 'image' | 'video', // Explicitly pass media type
  caption?: string
): Promise<void> {
  if (!userId || !media) throw new Error("User ID and media (file or URL) are required.");

  let mediaUrl = "";

  if (typeof media === 'string') { // Direct URL provided (for images)
    if (mediaType !== 'image') {
        throw new Error("Direct URL input is only supported for image statuses.");
    }
    mediaUrl = media;
  } else { // File object provided for upload
    const filePath = `statusMedia/${userId}/${mediaType}/${Date.now()}_${media.name}`;
    const storageRef = ref(storage, filePath);
    await uploadBytes(storageRef, media);
    mediaUrl = await getDownloadURL(storageRef);
  }

  const statusesColRef = collection(db, "statuses");
  const expirationDate = new Date();
  expirationDate.setHours(expirationDate.getHours() + 24);
  
  const userData = await getUserData(userId);

  const statusData: any = {
    userId,
    userName: userData.displayName,
    userAvatar: userData.photoURL,
    type: mediaType,
    content: mediaUrl,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(expirationDate),
    dataAiHint: mediaType === 'image' ? 'status image' : 'status video',
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

  const chunkSize = 30;
  for (let i = 0; i < currentUserAndFriendUIDs.length; i += chunkSize) {
    const chunk = currentUserAndFriendUIDs.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;

    const q = query(
        statusesColRef,
        where("userId", "in", chunk),
        where("expiresAt", ">", now),
        orderBy("userId"), 
        orderBy("createdAt", "desc") 
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
            caption: data.caption,
            createdAt: data.createdAt as Timestamp,
            expiresAt: data.expiresAt as Timestamp,
            dataAiHint: data.type === 'image' ? 'status image' : (data.type === 'video' ? 'status video' : undefined),
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
      // Statuses are already ordered by createdAt desc from the query for each user
      // No, the query groups by userId, then sorts by createdAt. We need to ensure per-user sorting if not already done.
      // The query `orderBy("userId"), orderBy("createdAt", "desc")` should suffice.
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

  if (diffDays === 0) { // Today, but more than an hour ago if diffHours > 0
    if (diffHours > 0 && diffHours < now.getHours()) return `${diffHours} hours ago`; // Check against current hour to avoid "23 hours ago" for something posted "today"
    return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  
  // Fallback for older dates, though statuses expire in 24h
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

