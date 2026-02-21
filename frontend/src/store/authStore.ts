import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../config/api';

// Auth modes
export type AuthMode = 'guest' | 'authenticated';

// Capabilities for permission checking
export type Capability = 
  | 'CAN_VIEW_PUBLIC_DATA'
  | 'CAN_START_SESSION'
  | 'CAN_STOP_SESSION'
  | 'CAN_VIEW_HISTORY'
  | 'CAN_MANAGE_PAYMENT'
  | 'CAN_VIEW_PROFILE';

interface User {
  id: string;
  email: string;
  name: string;
  payment_method_added: boolean;
  payment_method_last4?: string;
}

interface AuthState {
  mode: AuthMode;
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  
  // Pending action state (for resuming after login)
  pendingAction: {
    type: string;
    data?: any;
    returnTo?: string;
  } | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
  addPaymentMethod: (cardNumber: string, expiry: string, cvv: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  
  // Guest mode actions
  continueAsGuest: () => Promise<void>;
  upgradeFromGuest: (email: string, password: string, name?: string) => Promise<void>;
  
  // Capability checking
  hasCapability: (capability: Capability) => boolean;
  
  // Pending action management
  setPendingAction: (action: { type: string; data?: any; returnTo?: string } | null) => void;
  clearPendingAction: () => void;
}

// Capability definitions by mode
const GUEST_CAPABILITIES: Capability[] = ['CAN_VIEW_PUBLIC_DATA'];
const AUTH_CAPABILITIES: Capability[] = [
  'CAN_VIEW_PUBLIC_DATA',
  'CAN_START_SESSION',
  'CAN_STOP_SESSION',
  'CAN_VIEW_HISTORY',
  'CAN_MANAGE_PAYMENT',
  'CAN_VIEW_PROFILE',
];

export const useAuthStore = create<AuthState>((set, get) => ({
  mode: 'guest',
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  isGuest: false,
  pendingAction: null,

  loadToken: async () => {
    try {
      // Check for existing auth token
      const token = await AsyncStorage.getItem('auth_token');
      const guestMode = await AsyncStorage.getItem('guest_mode');
      
      if (token) {
        // Verify token is still valid
        const response = await axios.get(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        set({ 
          mode: 'authenticated',
          token, 
          user: response.data, 
          isAuthenticated: true, 
          isGuest: false,
          isLoading: false 
        });
      } else if (guestMode === 'true') {
        // User previously chose guest mode
        set({ 
          mode: 'guest',
          isGuest: true, 
          isAuthenticated: false,
          isLoading: false 
        });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      await AsyncStorage.removeItem('auth_token');
      set({ 
        mode: 'guest',
        token: null, 
        user: null, 
        isAuthenticated: false, 
        isGuest: false,
        isLoading: false 
      });
    }
  },

  login: async (email: string, password: string) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const { token, user } = response.data;
    
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.removeItem('guest_mode');
    
    set({ 
      mode: 'authenticated',
      token, 
      user, 
      isAuthenticated: true,
      isGuest: false 
    });
  },

  register: async (email: string, password: string, name: string) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, { email, password, name });
    const { token, user } = response.data;
    
    await AsyncStorage.setItem('auth_token', token);
    await AsyncStorage.removeItem('guest_mode');
    
    set({ 
      mode: 'authenticated',
      token, 
      user, 
      isAuthenticated: true,
      isGuest: false 
    });
  },

  logout: async () => {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('guest_mode');
    set({ 
      mode: 'guest',
      token: null, 
      user: null, 
      isAuthenticated: false,
      isGuest: false,
      pendingAction: null
    });
  },

  continueAsGuest: async () => {
    await AsyncStorage.setItem('guest_mode', 'true');
    set({ 
      mode: 'guest',
      isGuest: true, 
      isAuthenticated: false,
      isLoading: false 
    });
  },

  upgradeFromGuest: async (email: string, password: string, name?: string) => {
    // Try login first, if fails try register
    try {
      await get().login(email, password);
    } catch (loginError: any) {
      if (loginError.response?.status === 401 && name) {
        // User doesn't exist, create account
        await get().register(email, password, name);
      } else {
        throw loginError;
      }
    }
  },

  addPaymentMethod: async (cardNumber: string, expiry: string, cvv: string) => {
    const { token } = get();
    await axios.post(
      `${API_URL}/api/users/payment-method`,
      { card_number: cardNumber, expiry, cvv },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await get().refreshUser();
  },

  refreshUser: async () => {
    const { token } = get();
    if (token) {
      const response = await axios.get(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ user: response.data });
    }
  },

  hasCapability: (capability: Capability) => {
    const { mode } = get();
    if (mode === 'authenticated') {
      return AUTH_CAPABILITIES.includes(capability);
    }
    return GUEST_CAPABILITIES.includes(capability);
  },

  setPendingAction: (action) => {
    set({ pendingAction: action });
  },

  clearPendingAction: () => {
    set({ pendingAction: null });
  },
}));

// Helper hook for checking capabilities
export const useCapability = (capability: Capability): boolean => {
  return useAuthStore((state) => state.hasCapability(capability));
};

// Helper to check if user can perform action
export const canPerformAction = (capability: Capability): boolean => {
  return useAuthStore.getState().hasCapability(capability);
};
