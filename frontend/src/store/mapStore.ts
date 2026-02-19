import { create } from 'zustand';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import debounce from 'lodash/debounce';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PricingSummary {
  start_fee_cents: number;
  energy_rate_cents_per_kwh: number;
  tax_percent: number;
  penalty_summary: string;
  penalty_enabled: boolean;
  estimated_20kwh_cents: number;
}

interface ConnectorBreakdown {
  [key: string]: {
    total: number;
    available: number;
    max_kw: number;
  };
}

interface Availability {
  available_count: number;
  total_count: number;
  connector_breakdown: ConnectorBreakdown;
}

export interface NearbyStation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  pricing_summary: PricingSummary;
  availability: Availability;
  max_power_kw: number;
  updated_at: string;
}

interface Filters {
  connector_type: string | null;
  min_power_kw: number | null;
  max_price_cents: number | null;
  available_only: boolean;
  sort_by: 'distance' | 'price' | 'power' | 'estimated_cost';
}

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MapState {
  nearbyStations: NearbyStation[];
  selectedStation: NearbyStation | null;
  userLocation: { latitude: number; longitude: number } | null;
  region: Region;
  filters: Filters;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  
  setUserLocation: (location: { latitude: number; longitude: number }) => void;
  setRegion: (region: Region) => void;
  setFilters: (filters: Partial<Filters>) => void;
  setSearchQuery: (query: string) => void;
  selectStation: (station: NearbyStation | null) => void;
  fetchNearbyStations: () => Promise<void>;
  fetchStationsInViewport: (minLat: number, maxLat: number, minLng: number, maxLng: number) => Promise<void>;
  refreshAvailability: () => Promise<void>;
  clearError: () => void;
}

const DEFAULT_REGION: Region = {
  latitude: 51.9244, // Rotterdam
  longitude: 4.4777,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const DEFAULT_FILTERS: Filters = {
  connector_type: null,
  min_power_kw: null,
  max_price_cents: null,
  available_only: false,
  sort_by: 'distance',
};

export const useMapStore = create<MapState>((set, get) => ({
  nearbyStations: [],
  selectedStation: null,
  userLocation: null,
  region: DEFAULT_REGION,
  filters: DEFAULT_FILTERS,
  isLoading: false,
  error: null,
  searchQuery: '',

  setUserLocation: (location) => {
    set({ userLocation: location });
    // Also update region to center on user
    set((state) => ({
      region: {
        ...state.region,
        latitude: location.latitude,
        longitude: location.longitude,
      },
    }));
  },

  setRegion: (region) => set({ region }),

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    // Refetch with new filters
    get().fetchNearbyStations();
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  selectStation: (station) => set({ selectedStation: station }),

  fetchNearbyStations: async () => {
    const { region, filters, userLocation } = get();
    const lat = userLocation?.latitude || region.latitude;
    const lng = userLocation?.longitude || region.longitude;

    try {
      set({ isLoading: true, error: null });

      const params = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius_km: '20',
        sort_by: filters.sort_by,
      });

      if (filters.connector_type) {
        params.append('connector_type', filters.connector_type);
      }
      if (filters.min_power_kw) {
        params.append('min_power_kw', filters.min_power_kw.toString());
      }
      if (filters.max_price_cents) {
        params.append('max_price_cents', filters.max_price_cents.toString());
      }
      if (filters.available_only) {
        params.append('available_only', 'true');
      }

      const response = await axios.get(`${API_URL}/api/stations/nearby?${params}`);
      set({ nearbyStations: response.data, isLoading: false });
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || 'Failed to fetch stations',
        isLoading: false,
      });
    }
  },

  fetchStationsInViewport: async (minLat, maxLat, minLng, maxLng) => {
    const { filters } = get();

    try {
      const params = new URLSearchParams({
        min_lat: minLat.toString(),
        max_lat: maxLat.toString(),
        min_lng: minLng.toString(),
        max_lng: maxLng.toString(),
      });

      if (filters.connector_type) {
        params.append('connector_type', filters.connector_type);
      }
      if (filters.min_power_kw) {
        params.append('min_power_kw', filters.min_power_kw.toString());
      }
      if (filters.available_only) {
        params.append('available_only', 'true');
      }

      const response = await axios.get(`${API_URL}/api/stations/viewport?${params}`);
      // Merge with existing nearby stations or update
      set({ nearbyStations: response.data });
    } catch (error: any) {
      console.error('Failed to fetch viewport stations:', error);
    }
  },

  refreshAvailability: async () => {
    // Trigger a backend simulation update (for demo)
    try {
      await axios.post(`${API_URL}/api/simulate/availability`);
      // Then refetch
      await get().fetchNearbyStations();
    } catch (error) {
      console.error('Failed to refresh availability:', error);
    }
  },

  clearError: () => set({ error: null }),
}));
