import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDummyKey',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'dummy.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'dummy-project',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'dummy.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '0',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '0'
};

let auth: Auth | null = null;

export function initializeAuth() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    return auth;
  } catch (error) {
    console.error('Firebase init failed:', error);
    return null;
  }
}

export async function register(email: string, password: string): Promise<User | null> {
  if (!auth) auth = initializeAuth();
  if (!auth) throw new Error('Auth not initialized');

  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Email already registered');
    }
    if (error.code === 'auth/weak-password') {
      throw new Error('Password too weak (min 6 characters)');
    }
    throw new Error(error.message);
  }
}

export async function login(email: string, password: string): Promise<User | null> {
  if (!auth) auth = initializeAuth();
  if (!auth) throw new Error('Auth not initialized');

  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      throw new Error('User not found');
    }
    if (error.code === 'auth/wrong-password') {
      throw new Error('Invalid password');
    }
    throw new Error(error.message);
  }
}

export async function logout(): Promise<void> {
  if (!auth) auth = initializeAuth();
  if (!auth) throw new Error('Auth not initialized');

  return signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  if (!auth) auth = initializeAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export function getCurrentAuth(): Auth | null {
  return auth;
}
