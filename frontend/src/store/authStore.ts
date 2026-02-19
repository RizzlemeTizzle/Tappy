import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_URL } from '../config/api';

interface User {
  id: string;
  email: string;
  name: string;
  payment_method_added: boolean;
  payment_method_last4?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<void>;
  addPaymentMethod: (cardNumber: string, expiry: string, cvv: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  loadToken: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        // Verify token is still valid
        const response = await axios.get(`${API_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        set({ token, user: response.data, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      await AsyncStorage.removeItem('auth_token');
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, { email, password });
    const { token, user } = response.data;
    await AsyncStorage.setItem('auth_token', token);
    set({ token, user, isAuthenticated: true });
  },

  register: async (email: string, password: string, name: string) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, { email, password, name });
    const { token, user } = response.data;
    await AsyncStorage.setItem('auth_token', token);
    set({ token, user, isAuthenticated: true });
  },

  logout: async () => {
    await AsyncStorage.removeItem('auth_token');
    set({ token: null, user: null, isAuthenticated: false });
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
  }
}));
