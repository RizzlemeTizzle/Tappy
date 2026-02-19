import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../src/store/authStore';

export default function RootLayout() {
  const { loadToken, isLoading } = useAuthStore();

  useEffect(() => {
    loadToken();
  }, []);

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
