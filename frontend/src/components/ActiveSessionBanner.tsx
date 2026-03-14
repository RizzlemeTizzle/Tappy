import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../store/sessionStore';
import { formatCents } from '../utils/formatters';
import { useTranslation } from 'react-i18next';

interface Props {
  tabBarHeight: number;
  onLayout?: (height: number) => void;
}

export default function ActiveSessionBanner({ tabBarHeight, onLayout }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const currentSession = useSessionStore((s) => s.currentSession);

  if (!currentSession || currentSession.status === 'ENDED') return null;

  const isIdle = currentSession.status === 'IDLE';
  const iconName = isIdle ? 'warning' : 'flash';
  const iconColor = isIdle ? '#FF9800' : '#4CAF50';
  const statusLabel = isIdle ? t('pricing.idleFee') : t('session.sessionActive');

  return (
    <TouchableOpacity
      style={[styles.banner, { bottom: tabBarHeight + 8 }]}
      onPress={() =>
        router.push({ pathname: '/live-session', params: { sessionId: currentSession.id } })
      }
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.height)}
      activeOpacity={0.85}
    >
      <Ionicons name={iconName} size={18} color={iconColor} />
      <View style={styles.textGroup}>
        <Text style={styles.label}>{statusLabel}</Text>
        <Text style={styles.station} numberOfLines={1}>
          {currentSession.station?.name ?? t('session.sessionActive')}
        </Text>
      </View>
      <Text style={styles.cost}>{formatCents(currentSession.total_cost_cents)}</Text>
      <Ionicons name="chevron-forward" size={16} color="#888" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E1A',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#2E4A2E',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  textGroup: {
    flex: 1,
  },
  label: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  station: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  cost: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
