// src/firebase/config.js
// ⚠️  Keep this file out of version control.
// For production, use environment variables: import.meta.env.VITE_FIREBASE_API_KEY etc.

import { initializeApp, getApps, deleteApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
  applyActionCode,
  checkActionCode,
  reload,
  getIdToken,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  Timestamp,
  increment,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// All config must be supplied via environment variables.
// Copy .env.example to .env.local and fill in your values.
const _required = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const missing = Object.entries(_required)
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  throw new Error(
    `[Firebase] Missing required environment variables: ${missing.join(', ')}.\n` +
    'Copy .env.example to .env.local and fill in your Firebase project credentials.'
  );
}

const firebaseConfig = {
  ..._required,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // optional
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

const storage = getStorage(app);

const functions = getFunctions(app, 'us-central1');

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');

export {
  app, auth, db, storage, functions, httpsCallable, googleProvider,
  // Auth
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail,
  sendEmailVerification, applyActionCode, checkActionCode, reload, getIdToken,
  // Firestore
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, startAfter, serverTimestamp,
  arrayUnion, arrayRemove, Timestamp, increment, onSnapshot, runTransaction,
  // Storage
  storageRef, uploadBytes, getDownloadURL, deleteObject,
  // Secondary app helpers
  firebaseConfig, getApps, deleteApp,
};
