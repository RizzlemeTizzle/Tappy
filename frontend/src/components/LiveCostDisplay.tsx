import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatCents, formatKwh, formatPower, formatDuration, formatCountdown } from '../utils/formatters';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  deliveredKwh: number;
  currentPowerKw: number;
  batteryPercent: number | null;
  startedAt: string;
  startFeeCents: number;
  energyCostCents: number;
  penaltyCostCents: number;
  taxCents: number;
  totalCostCents: number;
  penaltyCountdownSeconds: number | null;
  status: string;
}

export default function LiveCostDisplay({
  deliveredKwh,
  currentPowerKw,
  batteryPercent,
  startedAt,
  startFeeCents,
  energyCostCents,
  penaltyCostCents,
  taxCents,
  totalCostCents,
  penaltyCountdownSeconds,
  status
}: Props) {
  const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000;

  return (
    <View style={styles.container}>
      {/* Status Badge */}
      <View style={[
        styles.statusBadge,
        status === 'CHARGING' ? styles.chargingBadge :
        status === 'COMPLETE' ? styles.completeBadge :
        styles.idleBadge
      ]}>
        <View style={[styles.statusDot, 
          status === 'CHARGING' ? styles.chargingDot :
          status === 'COMPLETE' ? styles.completeDot :
          styles.idleDot
        ]} />
        <Text style={styles.statusText}>
          {status === 'CHARGING' ? 'Charging...' :
           status === 'COMPLETE' ? 'Charge Complete' :
           status === 'IDLE' ? 'Idle (Penalty Accruing)' : status}
        </Text>
      </View>

      {/* Metrics Row */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Ionicons name="battery-charging" size={24} color="#4CAF50" />
          <Text style={styles.metricValue}>{formatKwh(deliveredKwh)}</Text>
          <Text style={styles.metricLabel}>Delivered</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Ionicons name="flash" size={24} color="#FFC107" />
          <Text style={styles.metricValue}>{formatPower(currentPowerKw)}</Text>
          <Text style={styles.metricLabel}>Power</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Ionicons name="time" size={24} color="#2196F3" />
          <Text style={styles.metricValue}>{formatDuration(elapsedSeconds)}</Text>
          <Text style={styles.metricLabel}>Duration</Text>
        </View>
      </View>

      {/* Battery Progress */}
      {batteryPercent !== null && (
        <View style={styles.batterySection}>
          <View style={styles.batteryHeader}>
            <Ionicons name="battery-full" size={20} color="#4CAF50" />
            <Text style={styles.batteryLabel}>Battery Level</Text>
            <Text style={styles.batteryPercent}>{batteryPercent}%</Text>
          </View>
          <View style={styles.batteryBarContainer}>
            <View style={[styles.batteryBar, { width: `${batteryPercent}%` }]} />
          </View>
        </View>
      )}

      {/* Penalty Countdown */}
      {penaltyCountdownSeconds !== null && penaltyCountdownSeconds > 0 && (
        <View style={styles.countdownSection}>
          <Ionicons name="warning" size={20} color="#FF9800" />
          <Text style={styles.countdownLabel}>Penalty begins in:</Text>
          <Text style={styles.countdownValue}>{formatCountdown(penaltyCountdownSeconds)}</Text>
        </View>
      )}

      {/* Cost Breakdown */}
      <View style={styles.costSection}>
        <Text style={styles.costHeader}>Cost Breakdown</Text>
        
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Start Fee</Text>
          <Text style={styles.costValue}>{formatCents(startFeeCents)}</Text>
        </View>
        
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Energy Cost</Text>
          <Text style={styles.costValue}>{formatCents(energyCostCents)}</Text>
        </View>
        
        {penaltyCostCents > 0 && (
          <View style={[styles.costRow, styles.penaltyRow]}>
            <Text style={styles.penaltyLabel}>Idle Penalty</Text>
            <Text style={styles.penaltyValue}>{formatCents(penaltyCostCents)}</Text>
          </View>
        )}
        
        <View style={styles.costRow}>
          <Text style={styles.costLabel}>Tax</Text>
          <Text style={styles.costValue}>{formatCents(taxCents)}</Text>
        </View>
        
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total So Far</Text>
          <Text style={styles.totalValue}>{formatCents(totalCostCents)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  chargingBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  completeBadge: {
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
  },
  idleBadge: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  chargingDot: {
    backgroundColor: '#4CAF50',
  },
  completeDot: {
    backgroundColor: '#2196F3',
  },
  idleDot: {
    backgroundColor: '#FF9800',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#444',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  metricLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  batterySection: {
    marginBottom: 16,
  },
  batteryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  batteryLabel: {
    color: '#B0B0B0',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  batteryPercent: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '700',
  },
  batteryBarContainer: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  batteryBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  countdownSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  countdownLabel: {
    color: '#FF9800',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  countdownValue: {
    color: '#FF9800',
    fontSize: 20,
    fontWeight: '700',
  },
  costSection: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
  },
  costHeader: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  costLabel: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  costValue: {
    color: '#E0E0E0',
    fontSize: 14,
  },
  penaltyRow: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  penaltyLabel: {
    color: '#FF9800',
    fontSize: 14,
  },
  penaltyValue: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#444',
    marginTop: 10,
    paddingTop: 12,
  },
  totalLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  totalValue: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: '700',
  },
});
