import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { collection, onSnapshot, doc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';

export interface AppNotification {
  id: string;
  type: 'card_required' | 'settlement_required' | 'loan_offer' | 'loan_offer_response' | 'seller_verification' | 'new_order';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  sellerVerified?: boolean;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  removeNotification: (id: string) => Promise<void>;
  addLocalNotification: (notif: Omit<AppNotification, 'createdAt' | 'read'>) => void;
}

const CARD_NOTIF = {
  id: 'card-required',
  type: 'card_required' as const,
  title: 'Connect a repayment card',
  body: 'A verified payment card is required before wholesalers can extend credit to you through Doyang.',
  read: false,
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [firestoreNotifications, setFirestoreNotifications] = useState<AppNotification[]>([]);
  const [localNotifications, setLocalNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setFirestoreNotifications([]);
      return;
    }

    const colRef = collection(db, 'users', user.uid, 'notifications');
    const unsub = onSnapshot(colRef, (snap) => {
      const notifs = snap.docs.map((d) => d.data() as AppNotification);
      notifs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setFirestoreNotifications(notifs);
    }, () => {});

    const ensureCardNotification = async () => {
      const userSnap = await getDoc(doc(db, 'users', user.uid)).catch(() => null);
      const data = userSnap?.data();
      if (!data) return;
      if (data.role !== 'retailer') return;
      if (data.cardConnected === true) return;

      const notifRef = doc(db, 'users', user.uid, 'notifications', 'card-required');
      const notifSnap = await getDoc(notifRef).catch(() => null);
      if (!notifSnap?.exists()) {
        setDoc(notifRef, {
          ...CARD_NOTIF,
          createdAt: new Date().toISOString(),
        }).catch(() => {});
      }
    };

    ensureCardNotification();

    return unsub;
  }, [user?.uid]);

  const removeNotification = useCallback(async (id: string) => {
    setLocalNotifications(prev => prev.filter(n => n.id !== id));
    if (!user?.uid) return;
    await deleteDoc(doc(db, 'users', user.uid, 'notifications', id)).catch(() => {});
  }, [user?.uid]);

  const addLocalNotification = useCallback((notif: Omit<AppNotification, 'createdAt' | 'read'>) => {
    const full: AppNotification = {
      ...notif,
      createdAt: new Date().toISOString(),
      read: false,
    };
    setLocalNotifications(prev => {
      const without = prev.filter(n => n.id !== notif.id);
      return [...without, full];
    });
  }, []);

  const localIds = new Set(localNotifications.map(n => n.id));
  const deduped = firestoreNotifications.filter(n => !localIds.has(n.id));
  const notifications = [...localNotifications, ...deduped];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, removeNotification, addLocalNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
