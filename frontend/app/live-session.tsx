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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../src/store/sessionStore';
import LiveCostDisplay from '../src/components/LiveCostDisplay';

export default function LiveSession() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { currentSession, fetchSession, stopSession, isLoading } = useSessionStore();
  const [stopping, setStopping] = useState(false);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

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

  const handleStopCharging = () => {
    Alert.alert(
      'Stop Charging',
      'Are you sure you want to stop this charging session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            setStopping(true);
            try {
              if (pollInterval.current) {
                clearInterval(pollInterval.current);
              }
              await stopSession(sessionId!);
              router.replace({ pathname: '/receipt', params: { sessionId } });
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to stop session');
              setStopping(false);
            }
          }
        }
      ]
    );
  };

  const handleGetHelp = () => {
    Alert.alert(
      'Need Help?',
      'Contact support at:\n\nPhone: 1-800-CHARGE\nEmail: support@chargetap.com',
      [{ text: 'OK' }]
    );
  };

  if (!currentSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
            <Text style={styles.snapshotTitle}>Locked Pricing</Text>
          </View>
          <Text style={styles.snapshotText}>
            Start: ${(currentSession.pricing_snapshot.start_fee_cents / 100).toFixed(2)} • 
            Energy: ${(currentSession.pricing_snapshot.energy_rate_cents_per_kwh / 100).toFixed(2)}/kWh • 
            Tax: {currentSession.pricing_snapshot.tax_percent}%
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
          <Text style={styles.helpButtonText}>Get Help</Text>
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
              <Text style={styles.stopButtonText}>Stop Charging</Text>
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
    paddingBottom: 120,
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 32,
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
