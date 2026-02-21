import React, { useEffect, useState, useCallback } from 'react';
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

export default function NotificationSettings() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isGuest, isAuthenticated } = useAuthStore();
  
  const [sessionUpdates, setSessionUpdates] = useState(true);
  const [penaltyAlerts, setPenaltyAlerts] = useState(true);
  const [paymentEnabled, setPaymentEnabled] = useState(true);
  const [costMilestones, setCostMilestones] = useState(false);
  const [prealertMinutes, setPrealertMinutes] = useState(5);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadPreferences = useCallback(async () => {
    if (isGuest || !isAuthenticated) {
      setIsLoaded(true);
      return;
    }
    
    try {
      const response = await api.get('/me/notification-preferences');
      const data = response.data;
      setSessionUpdates(data.session_updates_enabled ?? true);
      setPenaltyAlerts(data.penalty_alerts_enabled ?? true);
      setPaymentEnabled(data.payment_enabled ?? true);
      setCostMilestones(data.cost_milestones_enabled ?? false);
      setPrealertMinutes(data.penalty_prealert_minutes ?? 5);
    } catch (error) {
      console.log('Failed to load preferences, using defaults');
    } finally {
      setIsLoaded(true);
    }
  }, [isGuest, isAuthenticated]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const savePreference = async (key: string, value: any) => {
    if (isGuest) return;
    
    setIsSaving(true);
    try {
      await api.put('/me/notification-preferences', { [key]: value });
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.generic'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSessionUpdates = (value: boolean) => {
    setSessionUpdates(value);
    savePreference('session_updates_enabled', value);
  };

  const handlePenaltyAlerts = (value: boolean) => {
    setPenaltyAlerts(value);
    savePreference('penalty_alerts_enabled', value);
  };

  const handlePayment = (value: boolean) => {
    setPaymentEnabled(value);
    savePreference('payment_enabled', value);
  };

  const handleCostMilestones = (value: boolean) => {
    setCostMilestones(value);
    savePreference('cost_milestones_enabled', value);
  };

  const handlePrealertChange = (minutes: number) => {
    setPrealertMinutes(minutes);
    savePreference('penalty_prealert_minutes', minutes);
  };

  if (!isLoaded) {
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
          <Text style={styles.sectionTitle}>{t('notifications.sessionUpdates')}</Text>
          <View style={styles.card}>
            <View style={styles.toggleItem}>
              <View style={styles.toggleIcon}>
                <Ionicons name="flash" size={22} color="#4CAF50" />
              </View>
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>{t('notifications.sessionUpdates')}</Text>
                <Text style={styles.toggleDescription}>{t('notifications.sessionUpdatesDesc')}</Text>
              </View>
              <Switch
                value={sessionUpdates}
                onValueChange={handleSessionUpdates}
                trackColor={{ false: '#3A3A3A', true: '#4CAF50' }}
                thumbColor={sessionUpdates ? '#FFF' : '#888'}
              />
            </View>
          </View>
        </View>

        {/* Penalty Alerts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.penaltyAlerts')}</Text>
          <View style={styles.card}>
            <View style={styles.toggleItem}>
              <View style={[styles.toggleIcon, { backgroundColor: 'rgba(255, 152, 0, 0.15)' }]}>
                <Ionicons name="warning" size={22} color="#FF9800" />
              </View>
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>{t('notifications.penaltyAlerts')}</Text>
                <Text style={styles.toggleDescription}>{t('notifications.penaltyAlertsDesc')}</Text>
              </View>
              <Switch
                value={penaltyAlerts}
                onValueChange={handlePenaltyAlerts}
                trackColor={{ false: '#3A3A3A', true: '#4CAF50' }}
                thumbColor={penaltyAlerts ? '#FFF' : '#888'}
              />
            </View>
            
            {penaltyAlerts && (
              <>
                <View style={styles.divider} />
                <View style={styles.prealertSection}>
                  <Text style={styles.prealertLabel}>{t('notifications.penaltyPrealert')}</Text>
                  <View style={styles.prealertOptions}>
                    {PREALERT_OPTIONS.map((minutes) => (
                      <TouchableOpacity
                        key={minutes}
                        style={[
                          styles.prealertOption,
                          prealertMinutes === minutes && styles.prealertOptionActive,
                        ]}
                        onPress={() => handlePrealertChange(minutes)}
                      >
                        <Text
                          style={[
                            styles.prealertOptionText,
                            prealertMinutes === minutes && styles.prealertOptionTextActive,
                          ]}
                        >
                          {minutes} min
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Payment & Receipts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.paymentReceipts')}</Text>
          <View style={styles.card}>
            <View style={styles.toggleItem}>
              <View style={[styles.toggleIcon, { backgroundColor: 'rgba(33, 150, 243, 0.15)' }]}>
                <Ionicons name="card" size={22} color="#2196F3" />
              </View>
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>{t('notifications.paymentReceipts')}</Text>
                <Text style={styles.toggleDescription}>{t('notifications.paymentReceiptsDesc')}</Text>
              </View>
              <Switch
                value={paymentEnabled}
                onValueChange={handlePayment}
                trackColor={{ false: '#3A3A3A', true: '#4CAF50' }}
                thumbColor={paymentEnabled ? '#FFF' : '#888'}
              />
            </View>
          </View>
        </View>

        {/* Cost Milestones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('notifications.costMilestones')}</Text>
          <View style={styles.card}>
            <View style={styles.toggleItem}>
              <View style={styles.toggleIcon}>
                <Ionicons name="trending-up" size={22} color="#4CAF50" />
              </View>
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>{t('notifications.costMilestones')}</Text>
                <Text style={styles.toggleDescription}>{t('notifications.costMilestonesDesc')}</Text>
              </View>
              <Switch
                value={costMilestones}
                onValueChange={handleCostMilestones}
                trackColor={{ false: '#3A3A3A', true: '#4CAF50' }}
                thumbColor={costMilestones ? '#FFF' : '#888'}
              />
            </View>
          </View>
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
    padding: 16,
    paddingTop: 12,
  },
  prealertLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
  },
  prealertOptions: {
    flexDirection: 'row',
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
  bottomPadding: {
    height: 40,
  },
});
