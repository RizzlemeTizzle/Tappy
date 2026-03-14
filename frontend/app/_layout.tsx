import React, { useEffect } from 'react';
import { Stack, useRouter, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform, Linking } from 'react-native';
import { useAuthStore } from '../src/store/authStore';
import { useNotificationStore, initializeNotificationListeners } from '../src/store/notificationStore';
import { useSessionStore } from '../src/store/sessionStore';
import * as ExpoLinking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import '../src/i18n';
import api from '../src/utils/api';

export default function RootLayout() {
  const { loadToken, isLoading, isAuthenticated } = useAuthStore();
  const { checkActiveSession } = useSessionStore();
  const { requestPermissions, loadPreferences } = useNotificationStore();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const { t } = useTranslation();

  useEffect(() => {
    loadToken();
  }, []);

  // Request notification permissions once auth check completes
  useEffect(() => {
    if (!isLoading) {
      requestPermissions();
    }
  }, [isLoading]);

  // Load notification preferences from backend when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadPreferences();
    }
  }, [isAuthenticated]);

  // Register Expo push token with backend when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const registerPushToken = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        await api.post('/users/me/push-token', { token: tokenData.data });
      } catch {
        // Non-critical — fails silently on simulators or if permissions denied
      }
    };
    registerPushToken();
  }, [isAuthenticated]);

  // Set up notification tap/receive listeners for the lifetime of the app
  useEffect(() => {
    return initializeNotificationListeners();
  }, []);

  // Recover active session on app launch
  useEffect(() => {
    if (isLoading || !navigationState?.key || !isAuthenticated) return;
    checkActiveSession().then((session) => {
      if (session) {
        router.replace({ pathname: '/live-session', params: { sessionId: session.id } });
      }
    });
  }, [isLoading, isAuthenticated, navigationState?.key]);

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
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: t('auth.signIn'), headerBackTitle: t('common.back') }} />
        <Stack.Screen name="register" options={{ title: t('auth.createAccount'), headerBackTitle: t('common.back') }} />
        <Stack.Screen name="add-payment" options={{ title: t('payment.addCard'), headerBackTitle: t('common.back') }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="pricing-confirmation" options={{ title: t('pricing.title'), headerBackTitle: t('common.back') }} />
        <Stack.Screen name="live-session" options={{ title: t('session.sessionActive'), headerBackVisible: true, gestureEnabled: true }} />
        <Stack.Screen name="receipt" options={({ route }) => ({
          title: t('receipt.title'),
          headerBackVisible: (route.params as any)?.fromHistory === 'true',
          gestureEnabled: (route.params as any)?.fromHistory === 'true',
          headerBackTitle: t('common.back'),
        })} />
        <Stack.Screen name="history" options={{ title: t('history.title'), headerBackTitle: t('common.back') }} />
        <Stack.Screen name="station-details" options={{ title: t('station.details'), headerBackTitle: t('common.back') }} />
        <Stack.Screen name="qr-scanner" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="phone-as-card" options={{ headerShown: false }} />
        <Stack.Screen name="notification-settings" options={{ headerShown: false }} />
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
