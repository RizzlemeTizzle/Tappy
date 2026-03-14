import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../src/store/sessionStore';
import { useNotificationStore, NotificationType } from '../src/store/notificationStore';
import { formatCents, formatCentsPerMinute } from '../src/utils/formatters';
import LiveCostDisplay from '../src/components/LiveCostDisplay';
import { useTranslation } from 'react-i18next';

export default function LiveSession() {
  const router = useRouter();
  const { t } = useTranslation();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { currentSession, fetchSession, stopSession } = useSessionStore();
  const { scheduleLocalNotification, preferences } = useNotificationStore();
  const [stopping, setStopping] = useState(false);
  const pollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const completeFiredRef = useRef(false);
  const penaltyPrealertFiredRef = useRef(false);
  const penaltyStartedFiredRef = useRef(false);
  const lastMilestoneCentsRef = useRef(0);
  const userInitiatedStopRef = useRef(false);

  useEffect(() => {
    if (sessionId) {
      // Initial fetch
      fetchSession(sessionId);
      
      // Poll every 2 seconds
      pollInterval.current = setInterval(() => {
        fetchSession(sessionId);
      }, 2000);
    }

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [sessionId]);

  // Trigger notifications when session status changes
  useEffect(() => {
    if (!currentSession) return;
    const { status } = currentSession;

    // Charging complete (battery full, charger stopped)
    if (status === 'COMPLETE' && !completeFiredRef.current) {
      completeFiredRef.current = true;
      scheduleLocalNotification(NotificationType.CHARGING_COMPLETE, {
        station_name: currentSession.station?.name ?? '',
        total: formatCents(currentSession.total_cost_cents),
        energy: currentSession.delivered_kwh.toFixed(2),
      }, 0);
    }

    // Penalty pre-alert: countdown first drops into the user's prealert window
    const countdown = currentSession.penalty_countdown_seconds;
    if (
      !penaltyPrealertFiredRef.current &&
      countdown != null &&
      countdown > 0 &&
      countdown <= preferences.penalty_prealert_minutes * 60
    ) {
      penaltyPrealertFiredRef.current = true;
      scheduleLocalNotification(NotificationType.PENALTY_STARTS_SOON, {
        station_name: currentSession.station?.name ?? '',
        minutes: String(Math.ceil(countdown / 60)),
        rate: formatCentsPerMinute(currentSession.pricing_snapshot.penalty.penalty_cents_per_minute),
      }, 0);
    }

    // Penalty started (status becomes IDLE)
    if (status === 'IDLE' && prevStatusRef.current !== 'IDLE' && !penaltyStartedFiredRef.current) {
      penaltyStartedFiredRef.current = true;
      scheduleLocalNotification(NotificationType.PENALTY_STARTED, {
        station_name: currentSession.station?.name ?? '',
        rate: formatCentsPerMinute(currentSession.pricing_snapshot.penalty.penalty_cents_per_minute),
      }, 0);
    }

    // Cost milestones: fire at configured interval, only while actively charging
    if (preferences.cost_milestones_enabled && status === 'CHARGING') {
      const MILESTONE_CENTS = preferences.cost_milestone_cents ?? 500;
      const currentMilestone = Math.floor(currentSession.total_cost_cents / MILESTONE_CENTS) * MILESTONE_CENTS;
      if (currentMilestone > 0 && currentMilestone > lastMilestoneCentsRef.current) {
        lastMilestoneCentsRef.current = currentMilestone;
        scheduleLocalNotification(NotificationType.COST_MILESTONE, {
          total: formatCents(currentSession.total_cost_cents),
          energy: currentSession.delivered_kwh.toFixed(2),
        }, 0);
      }
    }

    // Session ended externally (cable pulled, power loss, charger fault)
    if (
      status === 'ENDED' &&
      prevStatusRef.current !== 'ENDED' &&
      !userInitiatedStopRef.current &&
      !completeFiredRef.current
    ) {
      scheduleLocalNotification(NotificationType.SESSION_INTERRUPTED, {
        station_name: currentSession.station?.name ?? '',
        reason: t('session.connectionLost'),
      }, 0);
    }

    // Stop polling once the session is fully ended
    if (status === 'ENDED' && pollInterval.current) {
      clearInterval(pollInterval.current);
      pollInterval.current = null;
    }

    prevStatusRef.current = status;
  }, [currentSession]);

  const handleStopCharging = () => {
    Alert.alert(
      t('session.stopCharging'),
      t('session.confirmStop'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('session.stop'),
          style: 'destructive',
          onPress: async () => {
            setStopping(true);
            userInitiatedStopRef.current = true;
            try {
              if (pollInterval.current) {
                clearInterval(pollInterval.current);
              }
              const stoppedSession = await stopSession(sessionId!);
              scheduleLocalNotification(NotificationType.SESSION_STOPPED, {
                station_name: currentSession?.station?.name ?? '',
                total: formatCents(stoppedSession.total_cost_cents),
              }, 0);
              // Delay receipt notification so it fires after the user has landed on the receipt screen
              scheduleLocalNotification(NotificationType.PAYMENT_SUCCEEDED, {
                total: formatCents(stoppedSession.total_cost_cents),
              }, 3);
              router.replace({ pathname: '/receipt', params: { sessionId } });
            } catch (error: any) {
              Alert.alert(t('common.error'), error.response?.data?.error || t('errors.generic'));
              setStopping(false);
            }
          }
        }
      ]
    );
  };

  const handleGetHelp = () => {
    Alert.alert(
      t('common.help'),
      t('session.helpContact'),
      [{ text: t('common.ok') }]
    );
  };

  if (!currentSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/find');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('session.sessionActive'),
          headerLeft: () => (
            <TouchableOpacity onPress={handleBack} style={styles.headerBackButton}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Station Info */}
        <View style={styles.stationInfo}>
          <Ionicons name="location" size={20} color="#4CAF50" />
          <View style={styles.stationText}>
            <Text style={styles.stationName}>{currentSession.station?.name}</Text>
            <Text style={styles.stationAddress}>{currentSession.station?.address}</Text>
          </View>
        </View>

        {/* Live Cost Display */}
        <LiveCostDisplay
          deliveredKwh={currentSession.delivered_kwh}
          currentPowerKw={currentSession.current_power_kw}
          batteryPercent={currentSession.battery_percent}
          startedAt={currentSession.started_at}
          startFeeCents={currentSession.pricing_snapshot.start_fee_cents}
          energyCostCents={currentSession.energy_cost_cents}
          penaltyCostCents={currentSession.penalty_cost_cents}
          taxCents={currentSession.tax_cents}
          totalCostCents={currentSession.total_cost_cents}
          penaltyCountdownSeconds={currentSession.penalty_countdown_seconds ?? null}
          status={currentSession.status}
        />

        {/* Pricing Snapshot Info */}
        <View style={styles.snapshotInfo}>
          <View style={styles.snapshotHeader}>
            <Ionicons name="lock-closed" size={16} color="#4CAF50" />
            <Text style={styles.snapshotTitle}>{t('pricing.locked')}</Text>
          </View>
          <Text style={styles.snapshotText}>
            {t('pricing.startFee')}: ${(currentSession.pricing_snapshot.start_fee_cents / 100).toFixed(2)} • 
            {t('pricing.energyRate')}: ${(currentSession.pricing_snapshot.energy_rate_cents_per_kwh / 100).toFixed(2)}{t('common.perKwh')} • 
            {t('pricing.tax')}: {currentSession.pricing_snapshot.tax_percent}%
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.helpButton}
          onPress={handleGetHelp}
        >
          <Ionicons name="help-circle" size={22} color="#FFFFFF" />
          <Text style={styles.helpButtonText}>{t('common.help')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.stopButton, stopping && styles.buttonDisabled]}
          onPress={handleStopCharging}
          disabled={stopping}
        >
          {stopping ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="stop-circle" size={22} color="#FFFFFF" />
              <Text style={styles.stopButtonText}>{t('session.stopCharging')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  headerBackButton: {
    paddingHorizontal: 8,
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
  scrollContent: {
    padding: 20,
    paddingBottom: 16,
  },
  stationInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  stationText: {
    marginLeft: 10,
    flex: 1,
  },
  stationName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  stationAddress: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  snapshotInfo: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  snapshotTitle: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  snapshotText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
  },
  bottomButtons: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    gap: 12,
  },
  helpButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  helpButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stopButton: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#F44336',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  stopButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
