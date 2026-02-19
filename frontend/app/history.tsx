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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../src/store/sessionStore';
import { formatCents, formatKwh, formatDate } from '../src/utils/formatters';

export default function History() {
  const router = useRouter();
  const { sessionHistory, fetchHistory, isLoading } = useSessionStore();

  useEffect(() => {
    fetchHistory();
  }, []);

  const renderSession = ({ item }: { item: any }) => {
    const isCompleted = item.status === 'ENDED';
    
    return (
      <TouchableOpacity style={styles.sessionCard}>
        <View style={styles.sessionHeader}>
          <View style={styles.stationInfo}>
            <Ionicons name="location" size={18} color="#4CAF50" />
            <Text style={styles.stationName}>{item.station?.name || 'Unknown Station'}</Text>
          </View>
          <View style={[
            styles.statusBadge,
            isCompleted ? styles.completedBadge : styles.activeBadge
          ]}>
            <Text style={[
              styles.statusText,
              isCompleted ? styles.completedText : styles.activeText
            ]}>
              {item.status}
            </Text>
          </View>
        </View>

        <Text style={styles.dateText}>{formatDate(item.started_at)}</Text>

        <View style={styles.sessionDetails}>
          <View style={styles.detailItem}>
            <Ionicons name="battery-charging" size={16} color="#888" />
            <Text style={styles.detailText}>{formatKwh(item.delivered_kwh)}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailItem}>
            <Ionicons name="cash" size={16} color="#888" />
            <Text style={styles.detailText}>{formatCents(item.total_cost_cents)}</Text>
          </View>
          {item.penalty_cost_cents > 0 && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailItem}>
                <Ionicons name="warning" size={16} color="#FF9800" />
                <Text style={[styles.detailText, styles.penaltyText]}>
                  +{formatCents(item.penalty_cost_cents)} penalty
                </Text>
              </View>
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading && sessionHistory.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : sessionHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color="#333" />
          <Text style={styles.emptyTitle}>No Charging History</Text>
          <Text style={styles.emptyText}>Your charging sessions will appear here</Text>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.back()}
          >
            <Text style={styles.startButtonText}>Start Charging</Text>
          </TouchableOpacity>
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
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  startButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
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
