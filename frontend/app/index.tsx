import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isGuest, user, isLoading, pendingAction, clearPendingAction } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    // Navigation logic
    if (isGuest) {
      // Guest mode - go to find tab
      router.replace('/(tabs)/find');
    } else if (!isAuthenticated) {
      // Not authenticated and not guest - show onboarding
      router.replace('/onboarding');
    } else if (!user?.payment_method_added) {
      // Authenticated but no payment method
      router.replace('/add-payment');
    } else {
      // Authenticated with payment method
      // Check for pending action to resume
      if (pendingAction?.returnTo) {
        const returnTo = pendingAction.returnTo;
        clearPendingAction();
        router.replace(returnTo as any);
      } else {
        router.replace('/(tabs)/find');
      }
    }
  }, [isAuthenticated, isGuest, user, isLoading]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
});
