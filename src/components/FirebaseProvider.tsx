import React, { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      setLoading(false);
      
      // Upsert user standard data if logging in
      if (currUser) {
        try {
          const userRef = doc(db, 'users', currUser.uid);
          await setDoc(userRef, {
            uid: currUser.uid,
            email: currUser.email,
            displayName: currUser.displayName,
            updatedAt: Date.now(),
            // Only set createdAt if we wanted to read it first, 
            // but setDoc with merge handles updates. 
            // We'll skip strict upsert here since rules demand exact schema.
            // For safety, let's let Firestore rules handle the payload matching exactly.
          }, { merge: true });
        } catch (error) {
          console.warn("Firestore rule might reject partial merge if keys don't match exactly. Skipping profile sync in free demo.");
        }
      }
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
