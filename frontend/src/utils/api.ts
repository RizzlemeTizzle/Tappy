import Constants from 'expo-constants';
import { Platform } from 'react-native';

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
    // Handle both chargetap:// and https:// URLs
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
 * Validate that a URL is a ChargeTap QR URL
 */
export function isChargeTapQR(url: string): boolean {
  return url.includes('chargetap://start') || url.includes('chargetap.app/start');
}
