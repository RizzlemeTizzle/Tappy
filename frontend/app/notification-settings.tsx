import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { useTranslation } from 'react-i18next';
import api from '../src/utils/api';

const PREALERT_OPTIONS = [1, 3, 5, 10];

interface NotificationPreferences {
  session_updates_enabled: boolean;
  penalty_alerts_enabled: boolean;
  payment_enabled: boolean;
  cost_milestones_enabled: boolean;
  penalty_prealert_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

const defaultPrefs: NotificationPreferences = {
  session_updates_enabled: true,
  penalty_alerts_enabled: true,
  payment_enabled: true,
  cost_milestones_enabled: false,
  penalty_prealert_minutes: 5,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

export default function NotificationSettings() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isGuest, isAuthenticated } = useAuthStore();
  
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPrefs);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      loadPreferences();
    }
  }, [isAuthenticated, isGuest]);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/me/notification-preferences');
      setPreferences(response.data);
    } catch (error) {
      console.log('[NotificationSettings] Failed to load preferences:', error);
      // Use defaults on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (key: keyof NotificationPreferences, value: boolean) => {
    const oldPrefs = { ...preferences };
    const newPrefs = { ...preferences, [key]: value };
    setPreferences(newPrefs);
    
    if (isGuest) {
      // For guests, just save locally
      return;
    }
    
    try {
      setIsSaving(true);
      await api.put('/me/notification-preferences', { [key]: value });
    } catch (error) {
      // Revert on error
      setPreferences(oldPrefs);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrealertChange = async (minutes: number) => {
    const oldPrefs = { ...preferences };
    const newPrefs = { ...preferences, penalty_prealert_minutes: minutes };
    setPreferences(newPrefs);
    
    if (isGuest) return;
    
    try {
      setIsSaving(true);
      await api.put('/me/notification-preferences', { penalty_prealert_minutes: minutes });
    } catch (error) {
      setPreferences(oldPrefs);
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  const ToggleItem = ({
    icon,
    title,
    description,
    value,
    onToggle,
    disabled = false,
  }: {
    icon: string;
    title: string;
    description: string;
    value: boolean;
    onToggle: (value: boolean) => void;
    disabled?: boolean;
  }) => (
    <View style={[styles.toggleItem, disabled && styles.toggleItemDisabled]}>
      <View style={styles.toggleIcon}>
        <Ionicons name={icon as any} size={22} color={disabled ? '#666' : '#4CAF50'} />
      </View>
      <View style={styles.toggleContent}>
        <Text style={[styles.toggleTitle, disabled && styles.toggleTitleDisabled]}>
          {title}
        </Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#3A3A3A', true: '#4CAF50' }}
        thumbColor={value ? '#FFF' : '#888'}
        disabled={disabled || isSaving}
      />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
        <View style={styles.placeholder}>
          {isSaving && <ActivityIndicator size="small" color="#4CAF50" />}
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Guest mode warning */}
        {isGuest && (
          <View style={styles.guestWarning}>
            <Ionicons name="information-circle" size={20} color="#FFC107" />
            <Text style={styles.guestWarningText}>
              {t('notifications.pushRequired')}
            </Text>
          </View>
        )}

        {/* Session Updates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('session.details')}</Text>
          <View style={styles.card}>
            <ToggleItem
              icon="flash"
              title={t('notifications.sessionUpdates')}
              description={t('notifications.sessionUpdatesDesc')}
              value={preferences.session_updates_enabled}
              onToggle={(v) => handleToggle('session_updates_enabled', v)}
            />
          </View>
        </View>

        {/* Penalty Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.penaltyAlerts')}</Text>
          <View style={styles.card}>
            <ToggleItem
              icon="warning"
              title={t('notifications.penaltyAlerts')}
              description={t('notifications.penaltyAlertsDesc')}
              value={preferences.penalty_alerts_enabled}
              onToggle={(v) => handleToggle('penalty_alerts_enabled', v)}
            />
            
            {preferences.penalty_alerts_enabled && (
              <View style={styles.prealertSection}>
                <View style={styles.divider} />
                <Text style={styles.prealertLabel}>{t('notifications.penaltyPrealert')}</Text>
                <Text style={styles.prealertDescription}>
                  {t('notifications.penaltyPrealertDesc')}
                </Text>
                <View style={styles.prealertOptions}>
                  {PREALERT_OPTIONS.map((minutes) => (
                    <TouchableOpacity
                      key={minutes}
                      style={[
                        styles.prealertOption,
                        preferences.penalty_prealert_minutes === minutes && styles.prealertOptionActive,
                      ]}
                      onPress={() => handlePrealertChange(minutes)}
                      disabled={isSaving}
                    >
                      <Text
                        style={[
                          styles.prealertOptionText,
                          preferences.penalty_prealert_minutes === minutes && styles.prealertOptionTextActive,
                        ]}
                      >
                        {minutes} min
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Payment & Receipts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.paymentReceipts')}</Text>
          <View style={styles.card}>
            <ToggleItem
              icon="card"
              title={t('notifications.paymentReceipts')}
              description={t('notifications.paymentReceiptsDesc')}
              value={preferences.payment_enabled}
              onToggle={(v) => handleToggle('payment_enabled', v)}
            />
          </View>
        </View>

        {/* Cost Milestones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.costMilestones')}</Text>
          <View style={styles.card}>
            <ToggleItem
              icon="trending-up"
              title={t('notifications.costMilestones')}
              description={t('notifications.costMilestonesDesc')}
              value={preferences.cost_milestones_enabled}
              onToggle={(v) => handleToggle('cost_milestones_enabled', v)}
            />
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={20} color="#2196F3" />
          <Text style={styles.infoText}>
            {isGuest 
              ? t('notifications.pushRequired')
              : t('notifications.sessionUpdatesDesc')
            }
          </Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
  guestWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    padding: 14,
    borderRadius: 12,
    marginTop: 16,
    gap: 10,
  },
  guestWarningText: {
    color: '#FFC107',
    fontSize: 14,
    flex: 1,
  },
  section: {
    marginTop: 24,
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
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  toggleItemDisabled: {
    opacity: 0.5,
  },
  toggleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  toggleContent: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  toggleTitleDisabled: {
    color: '#666',
  },
  toggleDescription: {
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 16,
  },
  prealertSection: {
    paddingTop: 8,
  },
  prealertLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 12,
    marginHorizontal: 16,
  },
  prealertDescription: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  prealertOptions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  prealertOption: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  prealertOptionActive: {
    backgroundColor: '#4CAF50',
  },
  prealertOptionText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  prealertOptionTextActive: {
    color: '#000',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    padding: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 10,
  },
  infoText: {
    color: '#888',
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  bottomPadding: {
    height: 40,
  },
});
