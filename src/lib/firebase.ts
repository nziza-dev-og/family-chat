import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore }from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBtW_66eIhTWIjtOzxAbJeVyWnoUlJDTzk",
  authDomain: "family-chating.firebaseapp.com",
  projectId: "family-chating",
  storageBucket: "family-chating.firebasestorage.app",
  messagingSenderId: "365927055066",
  appId: "1:365927055066:web:ab2169fc4a6a4c78b0afe3",
  measurementId: "G-PH7JFXGX9L"
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
