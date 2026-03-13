import { create } from 'zustand';
import api from '../utils/api';

interface FavoriteCharger {
  id: string;
  connector_type: string;
  max_kw: number;
  status: string;
}

export interface FavoriteStation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  chargers: FavoriteCharger[];
  availability: {
    available_count: number;
    total_count: number;
  };
}

interface FavoriteState {
  favoriteIds: Set<string>;
  favorites: FavoriteStation[];
  isLoading: boolean;

  loadFavorites: () => Promise<void>;
  addFavorite: (stationId: string) => Promise<void>;
  removeFavorite: (stationId: string) => Promise<void>;
  isFavorited: (stationId: string) => boolean;
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  favoriteIds: new Set(),
  favorites: [],
  isLoading: false,

  loadFavorites: async () => {
    try {
      set({ isLoading: true });
      const response = await api.get('/stations/favorites');
      const stations: FavoriteStation[] = response.data;
      set({
        favorites: stations,
        favoriteIds: new Set(stations.map((s) => s.id)),
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  addFavorite: async (stationId: string) => {
    // Optimistic update
    set((state) => ({
      favoriteIds: new Set(Array.from(state.favoriteIds).concat(stationId)),
    }));
    try {
      await api.post(`/stations/${stationId}/favorite`);
      // Reload full list to get station details
      await get().loadFavorites();
    } catch {
      // Rollback
      set((state) => {
        const next = new Set(state.favoriteIds);
        next.delete(stationId);
        return { favoriteIds: next };
      });
    }
  },

  removeFavorite: async (stationId: string) => {
    // Optimistic update
    set((state) => {
      const next = new Set(state.favoriteIds);
      next.delete(stationId);
      return {
        favoriteIds: next,
        favorites: state.favorites.filter((s) => s.id !== stationId),
      };
    });
    try {
      await api.delete(`/stations/${stationId}/favorite`);
    } catch {
      // Rollback by reloading
      await get().loadFavorites();
    }
  },

  isFavorited: (stationId: string) => get().favoriteIds.has(stationId),
}));
