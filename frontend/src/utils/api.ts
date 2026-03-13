import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL } from '../config/api';

/**
 * Get the API base URL based on environment
 */
export function getApiUrl(): string {
  // Check for explicit backend URL in environment
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL 
    || Constants.expoConfig?.extra?.backendUrl;
  
  if (backendUrl) {
    return backendUrl;
  }
  
  // Fallback for development
  if (__DEV__) {
    // For Android emulator
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8001';
    }
    // For iOS simulator / web
    return 'http://localhost:8001';
  }
  
  // Production fallback
  return '';
}

/**
 * Parse QR deep link URL
 */
export function parseQRDeepLink(url: string): Record<string, string> | null {
  try {
    // Handle both tappycharge:// and https:// URLs
    let queryString = '';
    
    if (url.includes('?')) {
      queryString = url.split('?')[1];
    } else {
      return null;
    }
    
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(queryString);
    
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    
    return params;
  } catch {
    return null;
  }
}

/**
 * Validate that a URL is a Tappy Charge QR URL
 */
export function isTappyChargeQR(url: string): boolean {
  return url.includes('tappycharge://start') || url.includes('tappycharge.com/start');
}

/**
 * Pre-configured axios instance with baseURL and auth token injection
 */
const apiInstance = axios.create({
  baseURL: `${API_URL}/api`,
});

apiInstance.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiInstance;
