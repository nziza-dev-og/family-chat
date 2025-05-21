
import { auth, db, storage } from "@/lib/firebase";
import { updateProfile, type User as FirebaseUser } from "firebase/auth";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, deleteObject } from "firebase/storage";

export async function updateUserProfileData(userId: string, data: { displayName?: string; photoURL?: string }) {
  const user = auth.currentUser;
  if (!user || user.uid !== userId) {
    throw new Error("User not authenticated or mismatch.");
  }

  const authUpdates: { displayName?: string; photoURL?: string } = {};
  const firestoreUpdates: { displayName?: string; photoURL?: string } = {};

  if (data.displayName !== undefined) {
    authUpdates.displayName = data.displayName;
    firestoreUpdates.displayName = data.displayName;
  }
  if (data.photoURL !== undefined) {
    authUpdates.photoURL = data.photoURL;
    firestoreUpdates.photoURL = data.photoURL;
  }

  if (Object.keys(authUpdates).length > 0) {
    await updateProfile(user, authUpdates);
  }

  if (Object.keys(firestoreUpdates).length > 0) {
    const userDocRef = doc(db, "users", userId);
    await updateDoc(userDocRef, firestoreUpdates);
  }
}

export async function uploadProfileImage(userId: string, file: File): Promise<string> {
  if (!userId) throw new Error("User ID is required.");
  if (!file) throw new Error("File is required.");

  const userDocRef = doc(db, "users", userId);
  const userDoc = await getDoc(userDocRef);
  const oldPhotoURL = userDoc.data()?.photoURL;

  // Optional: Delete old profile image from storage if it's a firebase storage URL
  if (oldPhotoURL && oldPhotoURL.includes("firebasestorage.googleapis.com")) {
    try {
      const oldImageRef = ref(storage, oldPhotoURL);
      await deleteObject(oldImageRef);
    } catch (error) {
      console.warn("Failed to delete old profile image:", error);
      // Non-critical error, proceed with uploading new image
    }
  }

  const filePath = `profileImages/${userId}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, filePath);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  await updateUserProfileData(userId, { photoURL: downloadURL });
  return downloadURL;
}
