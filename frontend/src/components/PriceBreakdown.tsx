import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCents, formatCentsPerKwh, formatCentsPerMinute } from '../utils/formatters';

interface PenaltyConfig {
  enabled: boolean;
  grace_minutes: number;
  penalty_cents_per_minute: number;
  applies_when: string;
  daily_cap_cents: number | null;
}

interface Props {
  startFeeCents: number;
  energyRateCentsPerKwh: number;
  penalty: PenaltyConfig;
  taxPercent: number;
  showExample?: boolean;
  isLocked?: boolean;
}

export default function PriceBreakdown({
  startFeeCents,
  energyRateCentsPerKwh,
  penalty,
  taxPercent,
  showExample = true,
  isLocked = false
}: Props) {
  // Example calculation: 20 kWh charge
  const exampleKwh = 20;
  const exampleEnergyCost = exampleKwh * energyRateCentsPerKwh;
  const exampleSubtotal = startFeeCents + exampleEnergyCost;
  const exampleTax = Math.round(exampleSubtotal * taxPercent / 100);
  const exampleTotal = exampleSubtotal + exampleTax;

  return (
    <View style={styles.container}>
      {isLocked && (
        <View style={styles.lockedBadge}>
          <Ionicons name="lock-closed" size={14} color="#4CAF50" />
          <Text style={styles.lockedText}>Locked for this session</Text>
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <Ionicons name="flash" size={18} color="#FFC107" />
          <Text style={styles.label}>Start Fee</Text>
        </View>
        <Text style={styles.value}>{formatCents(startFeeCents)}</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <Ionicons name="battery-charging" size={18} color="#4CAF50" />
          <Text style={styles.label}>Energy Rate</Text>
        </View>
        <Text style={styles.value}>{formatCentsPerKwh(energyRateCentsPerKwh)}</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.penaltySection}>
        <View style={styles.penaltyHeader}>
          <Ionicons name="time" size={18} color={penalty.enabled ? "#FF9800" : "#666"} />
          <Text style={[styles.label, !penalty.enabled && styles.disabledText]}>
            Idle Penalty {!penalty.enabled && '(Not Applied)'}
          </Text>
        </View>
        
        {penalty.enabled ? (
          <View style={styles.penaltyDetails}>
            <Text style={styles.penaltyText}>
              • Grace period: {penalty.grace_minutes} minutes after charge completes
            </Text>
            <Text style={styles.penaltyText}>
              • Rate: {formatCentsPerMinute(penalty.penalty_cents_per_minute)} after grace period
            </Text>
            {penalty.daily_cap_cents && (
              <Text style={styles.penaltyText}>
                • Daily cap: {formatCents(penalty.daily_cap_cents)} maximum
              </Text>
            )}
            <View style={styles.exampleBox}>
              <Text style={styles.exampleTitle}>Example:</Text>
              <Text style={styles.exampleText}>
                If you stay plugged 45 min after charging completes,{"\n"}
                penalty = (45 - {penalty.grace_minutes}) × {formatCentsPerMinute(penalty.penalty_cents_per_minute)}
                = {formatCents((45 - penalty.grace_minutes) * penalty.penalty_cents_per_minute)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.noPenaltyText}>No idle penalty at this station!</Text>
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <View style={styles.labelContainer}>
          <Ionicons name="receipt" size={18} color="#9C27B0" />
          <Text style={styles.label}>Tax</Text>
        </View>
        <Text style={styles.value}>{taxPercent}%</Text>
      </View>

      {showExample && (
        <>
          <View style={styles.divider} />
          <View style={styles.exampleCalculation}>
            <Text style={styles.exampleHeader}>Example Cost (20 kWh charge):</Text>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Start fee</Text>
              <Text style={styles.calcValue}>{formatCents(startFeeCents)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Energy (20 × {formatCentsPerKwh(energyRateCentsPerKwh)})</Text>
              <Text style={styles.calcValue}>{formatCents(exampleEnergyCost)}</Text>
            </View>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Tax ({taxPercent}%)</Text>
              <Text style={styles.calcValue}>{formatCents(exampleTax)}</Text>
            </View>
            <View style={[styles.calcRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCents(exampleTotal)}</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  lockedText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    color: '#E0E0E0',
    fontSize: 15,
    marginLeft: 10,
  },
  disabledText: {
    color: '#666',
  },
  value: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  penaltySection: {
    paddingVertical: 4,
  },
  penaltyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  penaltyDetails: {
    paddingLeft: 28,
  },
  penaltyText: {
    color: '#B0B0B0',
    fontSize: 13,
    lineHeight: 20,
  },
  noPenaltyText: {
    color: '#4CAF50',
    fontSize: 14,
    marginLeft: 28,
  },
  exampleBox: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  exampleTitle: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  exampleText: {
    color: '#B0B0B0',
    fontSize: 12,
    lineHeight: 18,
  },
  exampleCalculation: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 12,
  },
  exampleHeader: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcLabel: {
    color: '#B0B0B0',
    fontSize: 13,
  },
  calcValue: {
    color: '#E0E0E0',
    fontSize: 13,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#444',
    marginTop: 6,
    paddingTop: 8,
  },
  totalLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  totalValue: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '700',
  },
});
