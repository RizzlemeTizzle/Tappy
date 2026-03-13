import { create } from 'zustand';
import axios from 'axios';
import { API_URL } from '../config/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

interface NfcToken {
  id: string;
  token_uid: string;
  contract_id: string;
  visual_number: string;
  status: string;
  is_active: boolean;
  hce_enabled: boolean;
  device_id: string;
  device_model?: string;
  tap_count: number;
  last_tap_at?: string;
  created_at: string;
}

interface NfcState {
  tokens: NfcToken[];
  activeToken: { token_uid: string; contract_id: string } | null;
  isLoading: boolean;
  error: string | null;
  deviceId: string | null;
  
  // Actions
  initDeviceId: () => Promise<string>;
  fetchTokenStatus: () => Promise<void>;
  provisionToken: () => Promise<NfcToken>;
  activateToken: (tokenId: string) => Promise<void>;
  deactivateToken: (tokenId: string) => Promise<void>;
  recordTap: (tokenUid: string, location?: string) => Promise<void>;
  getActiveUid: () => Promise<string | null>;
  clearError: () => void;
}

const getAuthHeaders = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  return { Authorization: `Bearer ${token}` };
};

export const useNfcStore = create<NfcState>((set, get) => ({
  tokens: [],
  activeToken: null,
  isLoading: false,
  error: null,
  deviceId: null,

  initDeviceId: async () => {
    let deviceId = get().deviceId;
    if (deviceId) return deviceId;
    
    // Get unique device identifier
    if (Platform.OS === 'android') {
      deviceId = Application.getAndroidId() || `android-${Date.now()}`;
    } else {
      // For iOS or other platforms
      deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    set({ deviceId });
    return deviceId;
  },

  fetchTokenStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const deviceId = await get().initDeviceId();
      const headers = await getAuthHeaders();
      
      const response = await axios.get(
        `${API_URL}/api/v1/tokens/nfc/status?device_id=${deviceId}`,
        { headers }
      );

      set({
        tokens: response.data.tokens || [],
        activeToken: response.data.active_token,
        isLoading: false
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.response?.data?.message || 'Kon token status niet ophalen',
        isLoading: false
      });
    }
  },

  provisionToken: async () => {
    set({ isLoading: true, error: null });
    try {
      const deviceId = await get().initDeviceId();
      const headers = await getAuthHeaders();
      
      const response = await axios.post(
        `${API_URL}/api/v1/tokens/nfc/provision`,
        {
          device_id: deviceId,
          device_model: Platform.OS === 'android' ? 'Android Device' : 'iOS Device',
          android_version: Platform.OS === 'android' ? Platform.Version.toString() : undefined,
          is_rooted: false
        },
        { headers }
      );

      // Refresh token list
      await get().fetchTokenStatus();

      set({ isLoading: false });
      return response.data;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.response?.data?.message || 'Kon token niet aanmaken';
      set({ error: errorMsg, isLoading: false });
      throw new Error(errorMsg);
    }
  },

  activateToken: async (tokenId: string) => {
    set({ isLoading: true, error: null });
    try {
      const deviceId = await get().initDeviceId();
      const headers = await getAuthHeaders();
      
      await axios.post(
        `${API_URL}/api/v1/tokens/nfc/active`,
        { token_id: tokenId, device_id: deviceId },
        { headers }
      );

      // Refresh token list
      await get().fetchTokenStatus();

      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.response?.data?.message || 'Kon token niet activeren',
        isLoading: false
      });
    }
  },

  deactivateToken: async (tokenId: string) => {
    set({ isLoading: true, error: null });
    try {
      const deviceId = await get().initDeviceId();
      const headers = await getAuthHeaders();
      
      await axios.post(
        `${API_URL}/api/v1/tokens/nfc/disable`,
        { token_id: tokenId, device_id: deviceId },
        { headers }
      );

      // Refresh token list
      await get().fetchTokenStatus();

      set({ isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.error || error.response?.data?.message || 'Kon HCE niet uitschakelen',
        isLoading: false
      });
    }
  },

  recordTap: async (tokenUid: string, location?: string) => {
    try {
      const deviceId = await get().initDeviceId();
      const headers = await getAuthHeaders();
      
      await axios.post(
        `${API_URL}/api/v1/tokens/nfc/tap`,
        { token_uid: tokenUid, device_id: deviceId, location },
        { headers }
      );
    } catch (error) {
      // Silent fail for tap recording
      console.warn('Failed to record tap:', error);
    }
  },

  getActiveUid: async () => {
    try {
      const deviceId = await get().initDeviceId();
      const headers = await getAuthHeaders();
      
      const response = await axios.get(
        `${API_URL}/api/v1/tokens/nfc/active-uid?device_id=${deviceId}`,
        { headers }
      );
      
      if (response.data.active) {
        return response.data.token_uid;
      }
      return null;
    } catch (error) {
      return null;
    }
  },

  clearError: () => set({ error: null })
}));
