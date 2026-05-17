// src/hooks/useAuth.js
import { useEffect } from 'react';
import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { clearPermissionsCache } from './useAdminPermissions';

export function useAuthInit() {
  const { setUser, setUserProfile, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const profile = userDoc.exists() ? userDoc.data() : null;
          if (profile?.status === 'archived') {
            await signOut(auth);
            setUser(null);
            setUserProfile(null);
            setLoading(false);
            return;
          }
          setUserProfile(profile);
        } catch {
          setUserProfile(null);
        }
      } else {
        clearPermissionsCache();
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);
}
