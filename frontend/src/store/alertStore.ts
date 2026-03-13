import { create } from 'zustand';
import api from '../utils/api';

interface AlertState {
  alertStationIds: Set<string>;
  isLoading: boolean;

  loadAlerts: () => Promise<void>;
  setAlert: (stationId: string) => Promise<void>;
  cancelAlert: (stationId: string) => Promise<void>;
  hasAlert: (stationId: string) => boolean;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alertStationIds: new Set(),
  isLoading: false,

  loadAlerts: async () => {
    try {
      set({ isLoading: true });
      const response = await api.get('/stations/alerts');
      set({
        alertStationIds: new Set(response.data.station_ids as string[]),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  setAlert: async (stationId: string) => {
    // Optimistic update
    set((state) => ({
      alertStationIds: new Set(Array.from(state.alertStationIds).concat(stationId)),
    }));
    try {
      await api.post(`/stations/${stationId}/alert`);
    } catch {
      // Rollback
      set((state) => {
        const next = new Set(state.alertStationIds);
        next.delete(stationId);
        return { alertStationIds: next };
      });
    }
  },

  cancelAlert: async (stationId: string) => {
    // Optimistic update
    set((state) => {
      const next = new Set(state.alertStationIds);
      next.delete(stationId);
      return { alertStationIds: next };
    });
    try {
      await api.delete(`/stations/${stationId}/alert`);
    } catch {
      // Rollback
      set((state) => ({
        alertStationIds: new Set(Array.from(state.alertStationIds).concat(stationId)),
      }));
    }
  },

  hasAlert: (stationId: string) => get().alertStationIds.has(stationId),
}));
