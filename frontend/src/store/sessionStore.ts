import { create } from 'zustand';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config/api';

interface PenaltyConfig {
  enabled: boolean;
  grace_minutes: number;
  penalty_cents_per_minute: number;
  applies_when: string;
  daily_cap_cents: number | null;
}

interface PricingSnapshot {
  start_fee_cents: number;
  energy_rate_cents_per_kwh: number;
  penalty: PenaltyConfig;
  tax_percent: number;
  locked_at: string;
}

interface Station {
  id: string;
  name: string;
  address: string;
}

interface Charger {
  id: string;
  station_id: string;
  connector_type: string;
  max_kw: number;
  status: string;
  nfc_payload: string;
}

interface Pricing {
  id: string;
  station_id: string;
  start_fee_cents: number;
  energy_rate_cents_per_kwh: number;
  penalty: PenaltyConfig;
  tax_percent: number;
}

interface Session {
  id: string;
  user_id: string;
  charger_id: string;
  station_id: string;
  pricing_snapshot: PricingSnapshot;
  started_at: string;
  ended_at: string | null;
  delivered_kwh: number;
  current_power_kw: number;
  battery_percent: number | null;
  charging_complete_at: string | null;
  penalty_minutes: number;
  penalty_cost_cents: number;
  energy_cost_cents: number;
  tax_cents: number;
  total_cost_cents: number;
  status: string;
  station?: Station;
  charger?: Charger;
  penalty_countdown_seconds?: number | null;
}

interface SessionState {
  stations: any[];
  selectedStation: Station | null;
  selectedCharger: Charger | null;
  selectedPricing: Pricing | null;
  currentSession: Session | null;
  sessionHistory: Session[];
  isLoading: boolean;
  error: string | null;
  fetchStations: () => Promise<void>;
  resolveNfc: (nfcPayload: string) => Promise<void>;
  startSession: () => Promise<string>;
  fetchSession: (sessionId: string) => Promise<void>;
  stopSession: (sessionId: string) => Promise<Session>;
  fetchHistory: () => Promise<void>;
  clearSelection: () => void;
  setError: (error: string | null) => void;
}

const getToken = async () => {
  return await AsyncStorage.getItem('auth_token');
};

export const useSessionStore = create<SessionState>((set, get) => ({
  stations: [],
  selectedStation: null,
  selectedCharger: null,
  selectedPricing: null,
  currentSession: null,
  sessionHistory: [],
  isLoading: false,
  error: null,

  fetchStations: async () => {
    try {
      set({ isLoading: true });
      const response = await axios.get(`${API_URL}/api/stations`);
      set({ stations: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  resolveNfc: async (nfcPayload: string) => {
    try {
      set({ isLoading: true, error: null });
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/nfc/resolve`,
        { nfc_payload: nfcPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { station, charger, pricing } = response.data;
      set({
        selectedStation: station,
        selectedCharger: charger,
        selectedPricing: pricing,
        isLoading: false
      });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
      throw error;
    }
  },

  startSession: async () => {
    const { selectedCharger } = get();
    if (!selectedCharger) throw new Error('No charger selected');

    try {
      set({ isLoading: true, error: null });
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/sessions/start`,
        { charger_id: selectedCharger.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      set({ isLoading: false });
      return response.data.session_id;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
      throw error;
    }
  },

  fetchSession: async (sessionId: string) => {
    try {
      const token = await getToken();
      const response = await axios.get(`${API_URL}/api/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ currentSession: response.data });
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message });
    }
  },

  stopSession: async (sessionId: string) => {
    try {
      set({ isLoading: true });
      const token = await getToken();
      const response = await axios.post(
        `${API_URL}/api/sessions/${sessionId}/stop`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      set({ currentSession: response.data, isLoading: false });
      return response.data;
    } catch (error: any) {
      set({ error: error.response?.data?.detail || error.message, isLoading: false });
      throw error;
    }
  },

  fetchHistory: async () => {
    try {
      set({ isLoading: true });
      const token = await getToken();
      const response = await axios.get(`${API_URL}/api/sessions/user/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      set({ sessionHistory: response.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  clearSelection: () => {
    set({
      selectedStation: null,
      selectedCharger: null,
      selectedPricing: null,
      currentSession: null,
      error: null
    });
  },

  setError: (error: string | null) => set({ error })
}));
