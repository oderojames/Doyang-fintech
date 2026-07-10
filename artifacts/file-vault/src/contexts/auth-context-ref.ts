import { createContext } from 'react';
import type { User } from 'firebase/auth';

export interface AuthUser extends User {
  role?: 'retailer' | 'wholesaler' | 'buyer';
}

export interface StoredCardInfo {
  last4?: string;
  card_type?: string;
  bank?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  profileComplete: boolean | null;
  needsCardOnboarding: boolean;
  cardConnected: boolean | null;
  paystackAuth: StoredCardInfo | null;
  completeCardOnboarding: () => void;
  markCardConnected: (cardAuth?: StoredCardInfo) => void;
  needsSettlementOnboarding: boolean;
  settlementConnected: boolean | null;
  completeSettlementOnboarding: () => void;
  markSettlementConnected: () => void;
  buyerCardConnected: boolean | null;
  markBuyerCardConnected: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ role: 'retailer' | 'wholesaler' | 'buyer' }>;
  signUpWithEmail: (name: string, email: string, password: string, role?: 'retailer' | 'wholesaler' | 'buyer', businessType?: string) => Promise<void>;
  signInWithGoogle: (role?: 'retailer' | 'wholesaler' | 'buyer') => Promise<{ isNew: boolean; role: 'retailer' | 'wholesaler' | 'buyer' }>;
  completeProfile: (role: 'retailer' | 'wholesaler' | 'buyer', businessType: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  sendVerificationEmail: () => Promise<void>;
  reloadUser: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
