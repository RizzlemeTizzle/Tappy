import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { InlineLoginWall } from '../../src/components/LoginWall';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage, LanguageCode } from '../../src/i18n';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, isGuest } = useAuthStore();
  const { t, i18n } = useTranslation();
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);

  const handleLogout = () => {
    Alert.alert(t('common.logout'), t('auth.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/onboarding');
        },
      },
    ]);
  };

  const handleLanguageSelect = async (langCode: LanguageCode) => {
    await changeLanguage(langCode);
    setShowLanguagePicker(false);
  };

  const currentLanguage = SUPPORTED_LANGUAGES.find(
    (lang) => lang.code === getCurrentLanguage()
  );

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
        <Text style={styles.sectionTitle}>{t('profile.payment')}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="card"
            title={t('profile.paymentMethod')}
            subtitle={
              user?.payment_method_added
                ? t('profile.cardEndingIn', { last4: user.payment_method_last4 })
                : t('profile.noPaymentMethod')
            }
            onPress={() => router.push('/add-payment')}
          />
        </View>
      </View>

      {/* NFC Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.charging')}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="phone-portrait"
            title={t('profile.phoneAsCard')}
            subtitle={t('profile.phoneAsCardDesc')}
            onPress={() => router.push('/phone-as-card')}
          />
        </View>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('notifications.title')}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="notifications"
            title={t('notifications.title')}
            subtitle={t('notifications.sessionUpdatesDesc')}
            onPress={() => router.push('/notification-settings')}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.preferences')}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="notifications"
            title={t('profile.notifications')}
            subtitle={t('profile.notifications')}
            onPress={() => Alert.alert(t('common.loading'), t('profile.notifications'))}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="globe"
            title={t('profile.language')}
            subtitle={currentLanguage?.nativeName || 'English'}
            onPress={() => setShowLanguagePicker(true)}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="moon"
            title={t('profile.about')}
            subtitle="Dark mode"
            onPress={() => Alert.alert('Info', 'Dark mode is enabled by default')}
          />
        </View>
      </View>

      {/* Support Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.help')}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="help-circle"
            title={t('profile.faq')}
            onPress={() => Alert.alert(t('profile.help'), 'Contact us at support@chargetap.com')}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="document-text"
            title={t('profile.terms')}
            onPress={() => Alert.alert('Info', t('profile.terms'))}
          />
          <View style={styles.divider} />
          <MenuItem
            icon="shield-checkmark"
            title={t('profile.privacy')}
            onPress={() => Alert.alert('Info', t('profile.privacy'))}
          />
        </View>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.dangerZone')}</Text>
        <View style={styles.card}>
          <MenuItem
            icon="log-out"
            title={t('common.logout')}
            showChevron={false}
            danger
            onPress={handleLogout}
          />
        </View>
      </View>

      {/* Version */}
      <Text style={styles.version}>{t('profile.version', { version: '1.0.0' })}</Text>

      {/* Language Picker Modal */}
      <Modal
        visible={showLanguagePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLanguagePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('profile.language')}</Text>
              <TouchableOpacity onPress={() => setShowLanguagePicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={SUPPORTED_LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.languageItem,
                    getCurrentLanguage() === item.code && styles.languageItemActive,
                  ]}
                  onPress={() => handleLanguageSelect(item.code)}
                >
                  <View>
                    <Text style={styles.languageName}>{item.nativeName}</Text>
                    <Text style={styles.languageNameSecondary}>{item.name}</Text>
                  </View>
                  {getCurrentLanguage() === item.code && (
                    <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.languageList}
            />
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  languageList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  languageItemActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  languageName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  languageNameSecondary: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
});
