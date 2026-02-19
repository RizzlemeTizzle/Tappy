import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    // Navigation logic
    if (!isAuthenticated) {
      router.replace('/onboarding');
    } else if (!user?.payment_method_added) {
      router.replace('/add-payment');
    } else {
      router.replace('/ready-to-tap');
    }
  }, [isAuthenticated, user, isLoading]);

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
});
