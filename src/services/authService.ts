import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

export function initializeAuth() {
  return auth;
}

export async function register(email: string, password: string): Promise<User> {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') throw new Error('Email already registered');
    if (error.code === 'auth/weak-password') throw new Error('Password too weak (minimum 6 characters)');
    throw new Error(error.message || 'Registration failed');
  }
}

export async function login(email: string, password: string): Promise<User> {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error: any) {
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
      throw new Error('Invalid email or password');
    }
    throw new Error(error.message || 'Sign in failed');
  }
}

export function logout(): Promise<void> {
  return signOut(auth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentAuth() {
  return auth;
}
