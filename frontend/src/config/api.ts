import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get the API URL based on platform and environment
const getApiUrl = (): string => {
  // First try to get from expo-constants extra config
  const extraApiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (extraApiUrl) {
    return extraApiUrl;
  }

  // Try environment variable
  const envApiUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (envApiUrl) {
    return envApiUrl;
  }

  // Fallback for development - use the preview URL
  // This is the public URL that Expo Go can reach
  return 'https://ev-remote-start.preview.emergentagent.com';
};

export const API_URL = getApiUrl();

console.log('[API Config] Using API URL:', API_URL);
