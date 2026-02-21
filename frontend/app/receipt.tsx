import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../src/store/sessionStore';
import { formatCents, formatKwh, formatDate, formatTime } from '../src/utils/formatters';

export default function Receipt() {
  const router = useRouter();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { currentSession } = useSessionStore();

  if (!currentSession) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF5252" />
          <Text style={styles.errorText}>Receipt not found</Text>
          <TouchableOpacity
            style={styles.homeButton}
            onPress={() => router.replace('/(tabs)/tap')}
          >
            <Text style={styles.homeButtonText}>Naar Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    try {
      const receiptText = `
ChargeTap Receipt
==================

Station: ${currentSession.station?.name}
Address: ${currentSession.station?.address}

Session Details:
- Start: ${formatDate(currentSession.started_at)}
- End: ${currentSession.ended_at ? formatDate(currentSession.ended_at) : 'N/A'}
- Energy: ${formatKwh(currentSession.delivered_kwh)}

Charges:
- Start Fee: ${formatCents(currentSession.pricing_snapshot.start_fee_cents)}
- Energy Cost: ${formatCents(currentSession.energy_cost_cents)}
${currentSession.penalty_cost_cents > 0 ? `- Idle Penalty: ${formatCents(currentSession.penalty_cost_cents)}\n` : ''}- Tax: ${formatCents(currentSession.tax_cents)}

TOTAL: ${formatCents(currentSession.total_cost_cents)}

Thank you for using ChargeTap!
`;
      await Share.share({ message: receiptText });
    } catch (error) {
      Alert.alert('Error', 'Failed to share receipt');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Success Header */}
        <View style={styles.successHeader}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={48} color="#4CAF50" />
          </View>
          <Text style={styles.successTitle}>Charging Complete!</Text>
          <Text style={styles.totalAmount}>{formatCents(currentSession.total_cost_cents)}</Text>
          <Text style={styles.totalLabel}>Total Charged</Text>
        </View>

        {/* Station Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={18} color="#4CAF50" />
            <Text style={styles.sectionTitle}>Station</Text>
          </View>
          <Text style={styles.stationName}>{currentSession.station?.name}</Text>
          <Text style={styles.stationAddress}>{currentSession.station?.address}</Text>
          <Text style={styles.chargerId}>Charger ID: {currentSession.charger_id}</Text>
        </View>

        {/* Session Details */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={18} color="#2196F3" />
            <Text style={styles.sectionTitle}>Session Details</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Started</Text>
            <Text style={styles.detailValue}>{formatDate(currentSession.started_at)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ended</Text>
            <Text style={styles.detailValue}>
              {currentSession.ended_at ? formatDate(currentSession.ended_at) : 'N/A'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Energy Delivered</Text>
            <Text style={styles.detailValue}>{formatKwh(currentSession.delivered_kwh)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Meter Start</Text>
            <Text style={styles.detailValue}>{currentSession.meter_start_kwh?.toFixed(2)} kWh</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Meter End</Text>
            <Text style={styles.detailValue}>{currentSession.meter_end_kwh?.toFixed(2)} kWh</Text>
          </View>
        </View>

        {/* Cost Breakdown */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt" size={18} color="#FFC107" />
            <Text style={styles.sectionTitle}>Cost Breakdown</Text>
          </View>
          
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Start Fee</Text>
            <Text style={styles.costValue}>
              {formatCents(currentSession.pricing_snapshot.start_fee_cents)}
            </Text>
          </View>
          
          <View style={styles.costRow}>
            <View>
              <Text style={styles.costLabel}>Energy</Text>
              <Text style={styles.costSubLabel}>
                {formatKwh(currentSession.delivered_kwh)} @ ${(currentSession.pricing_snapshot.energy_rate_cents_per_kwh / 100).toFixed(2)}/kWh
              </Text>
            </View>
            <Text style={styles.costValue}>{formatCents(currentSession.energy_cost_cents)}</Text>
          </View>
          
          {currentSession.penalty_cost_cents > 0 && (
            <View style={[styles.costRow, styles.penaltyRow]}>
              <View>
                <Text style={styles.penaltyLabel}>Idle Penalty</Text>
                <Text style={styles.penaltySubLabel}>
                  {currentSession.penalty_minutes} min @ ${(currentSession.pricing_snapshot.penalty.penalty_cents_per_minute / 100).toFixed(2)}/min
                </Text>
              </View>
              <Text style={styles.penaltyValue}>{formatCents(currentSession.penalty_cost_cents)}</Text>
            </View>
          )}
          
          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Tax ({currentSession.pricing_snapshot.tax_percent}%)</Text>
            <Text style={styles.costValue}>{formatCents(currentSession.tax_cents)}</Text>
          </View>
          
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCents(currentSession.total_cost_cents)}</Text>
          </View>
        </View>

        {/* Pricing Snapshot Notice */}
        <View style={styles.snapshotNotice}>
          <Ionicons name="lock-closed" size={16} color="#4CAF50" />
          <Text style={styles.snapshotText}>
            Pricing was locked at session start: {formatDate(currentSession.pricing_snapshot.locked_at)}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="#FFFFFF" />
          <Text style={styles.shareButtonText}>Share Receipt</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => router.replace('/(tabs)/tap')}
        >
          <Text style={styles.doneButtonText}>Klaar</Text>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
  },
  homeButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  homeButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  totalAmount: {
    color: '#4CAF50',
    fontSize: 40,
    fontWeight: '700',
  },
  totalLabel: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  stationName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  stationAddress: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  chargerId: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  detailLabel: {
    color: '#888',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  costLabel: {
    color: '#B0B0B0',
    fontSize: 15,
  },
  costSubLabel: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  costValue: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  penaltyRow: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  penaltyLabel: {
    color: '#FF9800',
    fontSize: 15,
  },
  penaltySubLabel: {
    color: '#FF9800',
    fontSize: 12,
    opacity: 0.8,
    marginTop: 2,
  },
  penaltyValue: {
    color: '#FF9800',
    fontSize: 15,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  totalValue: {
    color: '#4CAF50',
    fontSize: 22,
    fontWeight: '700',
  },
  snapshotNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    padding: 12,
    borderRadius: 10,
  },
  snapshotText: {
    color: '#888',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
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
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    flex: 2,
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '600',
  },
});
