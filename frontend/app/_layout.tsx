import React, { useEffect } from 'react';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform, Linking } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import * as ExpoLinking from 'expo-linking';

export default function RootLayout() {
  const { loadToken, isLoading } = useAuthStore();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    loadToken();
  }, []);

  // Handle deep links
  useEffect(() => {
    // Only handle deep links after navigation is ready
    if (!navigationState?.key) return;
    
    const handleDeepLink = (event: { url: string }) => {
      const url = event.url;
      console.log('Deep link received:', url);
      
      // Handle ChargeTap QR deep links
      if (url.includes('chargetap://start') || url.includes('chargetap.app/start')) {
        const queryString = url.split('?')[1];
        if (queryString) {
          router.push({
            pathname: '/qr-scanner',
            params: { payload: queryString },
          });
        }
      }
    };
    
    // Check initial URL (app opened via deep link)
    const checkInitialUrl = async () => {
      try {
        const initialUrl = await ExpoLinking.getInitialURL();
        if (initialUrl) {
          handleDeepLink({ url: initialUrl });
        }
      } catch (error) {
        console.log('Error getting initial URL:', error);
      }
    };
    
    checkInitialUrl();
    
    // Listen for deep links while app is open
    const subscription = ExpoLinking.addEventListener('url', handleDeepLink);
    
    return () => {
      subscription.remove();
    };
  }, [navigationState?.key, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0A0A0A' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#0A0A0A' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign In', headerBackTitle: 'Back' }} />
        <Stack.Screen name="register" options={{ title: 'Create Account', headerBackTitle: 'Back' }} />
        <Stack.Screen name="add-payment" options={{ title: 'Add Payment Method', headerBackTitle: 'Back' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ready-to-tap" options={{ headerShown: false }} />
        <Stack.Screen name="pricing-confirmation" options={{ title: 'Confirm Pricing', headerBackTitle: 'Back' }} />
        <Stack.Screen name="live-session" options={{ title: 'Charging Session', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="receipt" options={{ title: 'Receipt', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="history" options={{ title: 'Charging History', headerBackTitle: 'Back' }} />
        <Stack.Screen name="station-details" options={{ title: 'Station Details', headerBackTitle: 'Back' }} />
        <Stack.Screen name="qr-scanner" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
});
