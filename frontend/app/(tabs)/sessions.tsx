import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../../src/store/sessionStore';
import { useAuthStore } from '../../src/store/authStore';
import { InlineLoginWall } from '../../src/components/LoginWall';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatDate as formatDateI18n } from '../../src/i18n';

export default function SessionsScreen() {
  const router = useRouter();
  const { sessionHistory, fetchHistory, isLoading } = useSessionStore();
  const { isGuest, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();

  useEffect(() => {
    if (isAuthenticated && !isGuest) {
      fetchHistory();
    }
  }, [isAuthenticated, isGuest]);

  const formatKwh = (kwh: number) => `${kwh.toFixed(2)} ${t('common.kwh')}`;

  // Show login wall for guests
  if (isGuest) {
    return (
      <View style={styles.container}>
        <InlineLoginWall
          actionType="view_history"
          showBrowseLink={false}
        />
      </View>
    );
  }

  const renderSession = ({ item }: { item: any }) => {
    const isCompleted = item.status === 'ENDED';

    return (
      <TouchableOpacity style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <View style={styles.stationInfo}>
            <Ionicons name="location" size={18} color="#4CAF50" />
            <Text style={styles.stationName}>{item.station?.name || t('station.details')}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            isCompleted ? styles.completedBadge : styles.activeBadge
          ]}>
            <Text style={[
              styles.statusText,
              isCompleted ? styles.completedText : styles.activeText
            ]}>
              {isCompleted ? t('session.sessionCompleted') : t('session.sessionActive')}
            </Text>
          </View>
        </View>

        <Text style={styles.dateText}>{formatDateI18n(item.started_at)}</Text>

        <View style={styles.sessionDetails}>
          <View style={styles.detailItem}>
            <Ionicons name="battery-charging" size={16} color="#888" />
            <Text style={styles.detailText}>{formatKwh(item.delivered_kwh)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailItem}>
            <Ionicons name="cash" size={16} color="#888" />
            <Text style={styles.detailText}>{formatCurrency(item.total_cost_cents)}</Text>
          </View>
          {item.penalty_cost_cents > 0 && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailItem}>
                <Ionicons name="warning" size={16} color="#FF9800" />
                <Text style={[styles.detailText, styles.penaltyText]}>
                  +{formatCurrency(item.penalty_cost_cents)} {t('pricing.idleFee')}
                </Text>
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {isLoading && sessionHistory.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : sessionHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color="#333" />
          <Text style={styles.emptyTitle}>{t('history.noSessions')}</Text>
          <Text style={styles.emptyText}>{t('history.noSessionsDesc')}</Text>
        </View>
      ) : (
        <FlatList
          data={sessionHistory}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
  },
  listContent: {
    padding: 20,
  },
  sessionCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stationName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completedBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  activeBadge: {
    backgroundColor: 'rgba(33, 150, 243, 0.2)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  completedText: {
    color: '#4CAF50',
  },
  activeText: {
    color: '#2196F3',
  },
  dateText: {
    color: '#888',
    fontSize: 13,
    marginBottom: 12,
  },
  sessionDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#444',
    marginHorizontal: 12,
  },
  detailText: {
    color: '#B0B0B0',
    fontSize: 14,
  },
  penaltyText: {
    color: '#FF9800',
  },
});
