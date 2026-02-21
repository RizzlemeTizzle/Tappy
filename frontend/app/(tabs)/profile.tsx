import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { InlineLoginWall } from '../../src/components/LoginWall';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isGuest, isAuthenticated } = useAuthStore();

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const MenuItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showChevron = true,
    danger = false,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    showChevron?: boolean;
    danger?: boolean;
  }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIcon, danger && styles.menuIconDanger]}>
        <Ionicons
          name={icon as any}
          size={22}
          color={danger ? '#FF5252' : '#4CAF50'}
        />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, danger && styles.menuTitleDanger]}>
          {title}
        </Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      {showChevron && (
        <Ionicons name="chevron-forward" size={20} color="#666" />
      )}
    </TouchableOpacity>
  );

  // Show login wall for guests
  if (isGuest) {
    return (
      <View style={styles.container}>
        <InlineLoginWall
          actionType="view_profile"
          showBrowseLink={false}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color="#4CAF50" />
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Payment Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Betaling</Text>
        <View style={styles.card}>
          <MenuItem
            icon="card"
            title="Betaalmethode"
            subtitle={
              user?.payment_method_added
                ? `Kaart eindigend op ${user.payment_method_last4}`
                : 'Geen betaalmethode'
            }
            onPress={() => router.push('/add-payment')}
          />
        </View>
      </View>

      {/* NFC Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Laden</Text>
        <View style={styles.card}>
          <MenuItem
            icon="phone-portrait"
            title="Telefoon als Laadpas"
            subtitle="Gebruik NFC om te laden"
            onPress={() => router.push('/phone-as-card')}
          />
        </View>
      </View>

      {/* Preferences Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.card}>
          <MenuItem
            icon="notifications"
            title="Notifications"
            subtitle="Manage notification settings"
            onPress={() => Alert.alert('Coming Soon', 'Notification settings coming soon')}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="globe"
            title="Language"
            subtitle="English"
            onPress={() => Alert.alert('Coming Soon', 'Language settings coming soon')}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="moon"
            title="Appearance"
            subtitle="Dark mode"
            onPress={() => Alert.alert('Info', 'Dark mode is enabled by default')}
          />
        </View>
      </View>

      {/* Support Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          <MenuItem
            icon="help-circle"
            title="Help Center"
            onPress={() => Alert.alert('Help', 'Contact us at support@chargetap.com')}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="document-text"
            title="Terms of Service"
            onPress={() => Alert.alert('Info', 'Terms of Service')}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="shield-checkmark"
            title="Privacy Policy"
            onPress={() => Alert.alert('Info', 'Privacy Policy')}
          />
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <MenuItem
            icon="log-out"
            title="Logout"
            showChevron={false}
            danger
            onPress={handleLogout}
          />
        </View>
      </View>

      {/* Version */}
      <Text style={styles.version}>ChargeTap v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  email: {
    color: '#888',
    fontSize: 15,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuIconDanger: {
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  menuTitleDanger: {
    color: '#FF5252',
  },
  menuSubtitle: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginLeft: 66,
  },
  version: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
