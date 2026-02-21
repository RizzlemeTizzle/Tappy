import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  
  // Calculate bottom padding - use safe area insets for proper spacing
  const bottomPadding = Platform.OS === 'ios' 
    ? Math.max(insets.bottom, 24) 
    : Math.max(insets.bottom, 24); // Increase Android bottom padding
  
  const tabBarHeight = Platform.OS === 'ios' 
    ? 56 + bottomPadding 
    : 56 + bottomPadding; // Consistent height calculation

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#888',
          tabBarStyle: {
            backgroundColor: '#0A0A0A',
            borderTopColor: '#1E1E1E',
            borderTopWidth: 1,
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: '#0A0A0A',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen
          name="find"
          options={{
            title: t('map.title'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="map" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tap"
          options={{
            title: t('tap.title'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="flash" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sessions"
          options={{
            title: t('history.title'),
            headerTitle: t('history.title'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="receipt" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('profile.title'),
            headerTitle: t('profile.title'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      
      {/* Floating QR Scanner Button */}
      <TouchableOpacity
        style={[styles.qrButton, { bottom: tabBarHeight + 16 }]}
        onPress={() => router.push('/qr-scanner')}
        activeOpacity={0.8}
      >
        <Ionicons name="qr-code" size={28} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  qrButton: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
