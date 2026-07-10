import { useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
  reload,
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, googleProvider, db } from '@/lib/firebase';
import { AuthContext, type AuthUser, type StoredCardInfo, type AuthContextValue } from './auth-context-ref';

async function ensureUserDoc(user: User, role: 'retailer' | 'wholesaler' | 'buyer' = 'retailer', businessType = '') {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || '',
      role,
      businessType,
      visibilityPreference: null,
      allowedWholesalers: [],
      createdAt: new Date().toISOString(),
      // Role-specific onboarding flags — each portal checks only its own flag.
      ...(role === 'retailer'
        ? { cardOnboardingDone: false }
        : role === 'wholesaler'
        ? { settlementOnboardingDone: false }
        : {}),
    });
  }
  // Ensure wholesaler is discoverable in the wholesalers collection
  const effectiveRole = snap.exists() ? (snap.data()?.role ?? role) : role;
  if (effectiveRole === 'wholesaler') {
    const wsRef = doc(db, 'wholesalers', user.uid);
    const wsSnap = await getDoc(wsRef).catch(() => null);
    if (!wsSnap?.exists()) {
      await setDoc(wsRef, {
        uid: user.uid,
        businessName: user.displayName || snap.data()?.displayName || '',
        businessType: businessType || snap.data()?.businessType || '',
        email: user.email || '',
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }
}

async function createPaystackCustomer(uid: string, name: string, email: string) {
  try {
    const res = await fetch('/api/paystack/create-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email }),
    });
    if (!res.ok) return;
    const { customer_code } = await res.json() as { customer_code?: string };
    if (customer_code) {
      await setDoc(doc(db, 'users', uid), { paystackCustomerCode: customer_code }, { merge: true })
        .catch(() => {});
    }
  } catch {
    // Non-fatal — registration still succeeds without a Paystack customer
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [needsCardOnboarding, setNeedsCardOnboarding] = useState(false);
  // null = not yet loaded; false = retailer without card; true = card connected
  const [cardConnected, setCardConnected] = useState<boolean | null>(null);
  const [paystackAuth, setPaystackAuth] = useState<StoredCardInfo | null>(null);
  const [needsSettlementOnboarding, setNeedsSettlementOnboarding] = useState(false);
  // null = loading; false = no subaccount; true = subaccount connected
  const [settlementConnected, setSettlementConnected] = useState<boolean | null>(null);
  // null = loading/non-buyer; false = buyer without card; true = card saved
  const [buyerCardConnected, setBuyerCardConnected] = useState<boolean | null>(null);

  const markCardConnected = (cardAuth?: StoredCardInfo) => {
    setCardConnected(true);
    if (cardAuth) setPaystackAuth(cardAuth);
  };
  const markSettlementConnected = () => setSettlementConnected(true);
  const markBuyerCardConnected = () => setBuyerCardConnected(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid)).catch(() => null);
        if (auth.currentUser?.uid !== firebaseUser.uid) return;
        const exists = !!snap?.exists();
        const data = snap?.data();
        const role = (data?.role as 'retailer' | 'wholesaler' | 'buyer') ?? 'retailer';
        setUser(Object.assign(firebaseUser, { role }));
        setProfileComplete(exists);
        // cardConnected: read directly from user profile — the source of truth.
        // undefined/missing field means not connected.
        setCardConnected(data?.cardConnected === true);
        setPaystackAuth(data?.cardConnected === true && data?.paystackAuth
          ? { last4: data.paystackAuth.last4, card_type: data.paystackAuth.card_type, bank: data.paystackAuth.bank }
          : null);
        setSettlementConnected(data?.settlementConnected === true);
        // Show card onboarding only for retailers whose doc explicitly has
        // cardOnboardingDone: false (new signups). Existing users have undefined → skip.
        if (role === 'retailer' && data?.cardOnboardingDone === false) {
          setNeedsCardOnboarding(true);
        }
        // Show settlement onboarding for wholesalers with settlementOnboardingDone: false.
        if (role === 'wholesaler' && data?.settlementOnboardingDone === false) {
          setNeedsSettlementOnboarding(true);
        }
        // Track whether a buyer has saved a payment card.
        if (role === 'buyer') {
          setBuyerCardConnected(data?.buyerCardConnected === true);
        }
        // Best-effort: manage the card-required notification badge in Firestore.
        // This is supplementary; the banner uses cardConnected state above instead.
        if (exists && role === 'retailer') {
          const notifRef = doc(db, 'users', firebaseUser.uid, 'notifications', 'card-required');
          if (data?.cardConnected !== true) {
            getDoc(notifRef).then((notifSnap) => {
              if (!notifSnap.exists()) {
                setDoc(notifRef, {
                  id: 'card-required',
                  type: 'card_required',
                  title: 'Connect a repayment card',
                  body: 'A verified payment card is required before wholesalers can extend credit to you through Doyang.',
                  createdAt: new Date().toISOString(),
                  read: false,
                }).catch(() => {});
              }
            }).catch(() => {});
          } else {
            deleteDoc(notifRef).catch(() => {});
          }
        }
      } else {
        setUser(null);
        setProfileComplete(null);
        setNeedsCardOnboarding(false);
        setCardConnected(null);
        setPaystackAuth(null);
        setNeedsSettlementOnboarding(false);
        setSettlementConnected(null);
        setBuyerCardConnected(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithEmail = async (email: string, password: string): Promise<{ role: 'retailer' | 'wholesaler' | 'buyer' }> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const snap = await getDoc(doc(db, 'users', cred.user.uid)).catch(() => null);
    const role: 'retailer' | 'wholesaler' | 'buyer' = (snap?.data()?.role as 'retailer' | 'wholesaler' | 'buyer') ?? 'retailer';
    // Backfill wholesaler discoverability for existing accounts
    if (role === 'wholesaler') {
      const wsRef = doc(db, 'wholesalers', cred.user.uid);
      const wsSnap = await getDoc(wsRef).catch(() => null);
      if (!wsSnap?.exists()) {
        await setDoc(wsRef, {
          uid: cred.user.uid,
          businessName: cred.user.displayName || snap?.data()?.displayName || '',
          businessType: snap?.data()?.businessType || '',
          email: cred.user.email || '',
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }
    }
    return { role };
  };

  const signUpWithEmail = async (name: string, email: string, password: string, role: 'retailer' | 'wholesaler' | 'buyer' = 'retailer', businessType = '') => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, role, businessType);
    const portalPath = role === 'wholesaler' ? 'wholesaler' : role === 'buyer' ? 'buyer' : 'retailer';
    const continueUrl = `${window.location.origin}/${portalPath}?verified=1`;
    fetch('/api/email/send-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cred.user.email, continueUrl }),
    }).catch(() => {});
    if (role === 'retailer') {
      setNeedsCardOnboarding(true);
      createPaystackCustomer(cred.user.uid, name, email); // fire-and-forget
    }
  };

  const sendVerificationEmail = async () => {
    if (!auth.currentUser?.email) return;
    const role = user?.role ?? 'retailer';
    const continueUrl = `${window.location.origin}/${role === 'wholesaler' ? 'wholesaler' : 'retailer'}?verified=1`;
    const res = await fetch('/api/email/send-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: auth.currentUser.email, continueUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? 'Failed to send verification email');
    }
  };

  const reloadUser = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await reload(auth.currentUser);
    if (auth.currentUser.emailVerified) {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid)).catch(() => null);
      const role = (snap?.data()?.role as 'retailer' | 'wholesaler') ?? 'retailer';
      setUser(Object.assign(auth.currentUser, { role }));
      return true;
    }
    return false;
  };

  const signInWithGoogle = async (role: 'retailer' | 'wholesaler' | 'buyer' = 'retailer'): Promise<{ isNew: boolean; role: 'retailer' | 'wholesaler' | 'buyer' }> => {
    const cred = await signInWithPopup(auth, googleProvider);
    const snap = await getDoc(doc(db, 'users', cred.user.uid)).catch(() => null);
    if (snap?.exists()) {
      const existingRole = (snap.data()?.role as 'retailer' | 'wholesaler' | 'buyer') ?? 'retailer';
      setUser(Object.assign(cred.user, { role: existingRole }));
      setProfileComplete(true);
      return { isNew: false, role: existingRole };
    }
    // New Google account — do NOT auto-provision. Require account creation.
    setProfileComplete(false);
    return { isNew: true, role };
  };

  const completeProfile = async (role: 'retailer' | 'wholesaler' | 'buyer', businessType: string, name: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw { code: 'auth/no-user' };
    if (name.trim()) {
      await updateProfile(currentUser, { displayName: name.trim() });
    }
    await ensureUserDoc(currentUser, role, businessType);
    setUser(Object.assign(currentUser, { role }));
    setProfileComplete(true);
    if (role === 'retailer') {
      setNeedsCardOnboarding(true);
      createPaystackCustomer(currentUser.uid, name.trim() || currentUser.displayName || '', currentUser.email || '');
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const sendPasswordReset = async (email: string) => {
    await fetch('/api/email/send-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  };

  const deleteAccount = async (password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) throw { code: 'auth/no-user' };
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    const snap = await getDoc(doc(db, 'users', currentUser.uid)).catch(() => null);
    const role = snap?.data()?.role ?? 'retailer';
    if (role === 'retailer') {
      const analysesSnap = await getDocs(collection(db, 'users', currentUser.uid, 'vault_analyses')).catch(() => null);
      if (analysesSnap && !analysesSnap.empty) {
        const batch = writeBatch(db);
        analysesSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit().catch(() => {});
      }
      const reportsSnap = await getDocs(query(collection(db, 'retailer_reports'), where('retailerUid', '==', currentUser.uid))).catch(() => null);
      if (reportsSnap && !reportsSnap.empty) {
        const batch = writeBatch(db);
        reportsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit().catch(() => {});
      }
    } else {
      await deleteDoc(doc(db, 'wholesalers', currentUser.uid)).catch(() => {});
    }
    await deleteDoc(doc(db, 'users', currentUser.uid)).catch(() => {});
    await deleteUser(currentUser);
  };

  const completeCardOnboarding = () => setNeedsCardOnboarding(false);
  const completeSettlementOnboarding = () => setNeedsSettlementOnboarding(false);

  return (
    <AuthContext.Provider value={{ user, loading, profileComplete, needsCardOnboarding, cardConnected, paystackAuth, markCardConnected, completeCardOnboarding, needsSettlementOnboarding, settlementConnected, markSettlementConnected, completeSettlementOnboarding, buyerCardConnected, markBuyerCardConnected, signInWithEmail, signUpWithEmail, signInWithGoogle, completeProfile, signOut, sendPasswordReset, deleteAccount, sendVerificationEmail, reloadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
