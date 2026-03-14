import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { showAlert } from '../src/utils/alert';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import PriceBreakdown from '../src/components/PriceBreakdown';
import { useSessionStore } from '../src/store/sessionStore';
import { useFavoriteStore } from '../src/store/favoriteStore';
import { useAlertStore } from '../src/store/alertStore';
import { API_URL } from '../src/config/api';

interface Charger {
  id: string;
  station_id: string;
  connector_type: string;
  max_kw: number;
  status: string;
  nfc_payload: string;
}

interface Station {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  chargers: Charger[];
  pricing: {
    start_fee_cents: number;
    energy_rate_cents_per_kwh: number;
    penalty: {
      enabled: boolean;
      grace_minutes: number;
      penalty_cents_per_minute: number;
      daily_cap_cents: number | null;
    };
    tax_percent: number;
  };
}

export default function StationDetails() {
  const router = useRouter();
  const { t } = useTranslation();
  const { stationId } = useLocalSearchParams<{ stationId: string }>();
  const { resolveNfc } = useSessionStore();
  const { isFavorited, addFavorite, removeFavorite, loadFavorites } = useFavoriteStore();
  const { hasAlert, setAlert, cancelAlert, loadAlerts } = useAlertStore();
  const [station, setStation] = useState<Station | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStation();
    loadFavorites();
    loadAlerts();
  }, [stationId]);

  const loadStation = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/api/stations/${stationId}`);
      setStation(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('errors.failedToLoadStation'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!station) return;
    
    const scheme = Platform.select({
      ios: 'maps:',
      android: 'geo:',
    });
    const url = Platform.select({
      ios: `maps:?daddr=${station.latitude},${station.longitude}`,
      android: `geo:${station.latitude},${station.longitude}?q=${station.latitude},${station.longitude}(${encodeURIComponent(station.name)})`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {
        showAlert(t('common.error'), t('errors.couldNotOpenMaps'));
      });
    }
  };

  const handleStartCharging = async (charger: Charger) => {
    if (charger.status !== 'AVAILABLE') {
      showAlert(t('errors.unavailable'), t('errors.chargerCurrentlyStatus', { status: charger.status }));
      return;
    }

    try {
      await resolveNfc(charger.nfc_payload);
      router.push('/pricing-confirmation');
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.error || t('errors.failedToConnectCharger'));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return '#4CAF50';
      case 'CHARGING':
        return '#2196F3';
      case 'FAULTED':
        return '#FF5252';
      default:
        return '#888';
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !station) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF5252" />
          <Text style={styles.errorText}>{error || t('station.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const availableCount = station.chargers.filter(c => c.status === 'AVAILABLE').length;
  const totalCount = station.chargers.length;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Station Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerInfo}>
              <Text style={styles.stationName}>{station.name}</Text>
              <Text style={styles.stationAddress}>{station.address}</Text>
            </View>
            <View style={[
              styles.availabilityBadge,
              { backgroundColor: availableCount > 0 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(255, 82, 82, 0.2)' }
            ]}>
              <Text style={[
                styles.availabilityText,
                { color: availableCount > 0 ? '#4CAF50' : '#FF5252' }
              ]}>
                {t('station.availableOf', { available: availableCount, total: totalCount })}
              </Text>
            </View>
          </View>

          {/* Favorite & Alert actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => stationId && (isFavorited(stationId) ? removeFavorite(stationId) : addFavorite(stationId))}
            >
              <Ionicons
                name={isFavorited(stationId ?? '') ? 'star' : 'star-outline'}
                size={20}
                color={isFavorited(stationId ?? '') ? '#FFD700' : '#888'}
              />
              <Text style={[styles.actionText, isFavorited(stationId ?? '') && { color: '#FFD700' }]}>
                {isFavorited(stationId ?? '') ? t('station.savedLabel') : t('station.saveLabel')}
              </Text>
            </TouchableOpacity>

            <View style={styles.actionDivider} />

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => stationId && (hasAlert(stationId) ? cancelAlert(stationId) : setAlert(stationId))}
            >
              <Ionicons
                name={hasAlert(stationId ?? '') ? 'notifications' : 'notifications-outline'}
                size={20}
                color={hasAlert(stationId ?? '') ? '#4CAF50' : '#888'}
              />
              <Text style={[styles.actionText, hasAlert(stationId ?? '') && { color: '#4CAF50' }]}>
                {hasAlert(stationId ?? '') ? t('station.alertSet') : t('station.notifyMe')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.navigateButton} onPress={handleNavigate}>
            <Ionicons name="navigate" size={20} color="#4CAF50" />
            <Text style={styles.navigateText}>{t('station.navigateTo')}</Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Chargers List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('station.chargers')}</Text>
          {station.chargers.map((charger) => (
            <TouchableOpacity
              key={charger.id}
              style={[
                styles.chargerCard,
                charger.status === 'AVAILABLE' && styles.chargerCardAvailable,
              ]}
              onPress={() => handleStartCharging(charger)}
              disabled={charger.status !== 'AVAILABLE'}
            >
              <View style={styles.chargerInfo}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(charger.status) }]} />
                <View style={styles.chargerDetails}>
                  <Text style={styles.chargerType}>{charger.connector_type}</Text>
                  <Text style={styles.chargerPower}>{charger.max_kw} kW</Text>
                </View>
              </View>
              <View style={styles.chargerRight}>
                <Text style={[styles.chargerStatus, { color: getStatusColor(charger.status) }]}>
                  {charger.status}
                </Text>
                {charger.status === 'AVAILABLE' && (
                  <Ionicons name="chevron-forward" size={20} color="#4CAF50" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pricing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('pricing.title')}</Text>
          <PriceBreakdown
            startFeeCents={station.pricing.start_fee_cents}
            energyRateCentsPerKwh={station.pricing.energy_rate_cents_per_kwh}
            penalty={station.pricing.penalty}
            taxPercent={station.pricing.tax_percent}
            showExample={true}
          />
        </View>

        {/* Penalty Explanation */}
        {station.pricing.penalty.enabled && (
          <View style={styles.penaltyExplanation}>
            <View style={styles.penaltyHeader}>
              <Ionicons name="warning" size={20} color="#FF9800" />
              <Text style={styles.penaltyTitle}>{t('station.idleFeeDetails')}</Text>
            </View>
            <View style={styles.penaltyContent}>
              <Text style={styles.penaltyItem}>
                • {t('station.penaltyGrace', { minutes: station.pricing.penalty.grace_minutes })}
              </Text>
              <Text style={styles.penaltyItem}>
                • {t('station.penaltyRate', { rate: (station.pricing.penalty.penalty_cents_per_minute / 100).toFixed(2) })}
              </Text>
              {station.pricing.penalty.daily_cap_cents ? (
                <Text style={styles.penaltyItem}>
                  • {t('station.penaltyMaxPerDay', { max: (station.pricing.penalty.daily_cap_cents / 100).toFixed(0) })}
                </Text>
              ) : (
                <Text style={[styles.penaltyItem, styles.penaltyWarning]}>
                  • {t('station.penaltyNoCap')}
                </Text>
              )}
            </View>
            <View style={styles.penaltyExample}>
              <Text style={styles.penaltyExampleTitle}>{t('station.penaltyExampleTitle')}</Text>
              <Text style={styles.penaltyExampleText}>
                {t('station.penaltyExampleIntro')}{'\n'}
                {t('station.penaltyExampleCalc', { graceMins: station.pricing.penalty.grace_minutes, rate: (station.pricing.penalty.penalty_cents_per_minute / 100).toFixed(2) })}{'\n'}
                {t('station.penaltyExampleTotal', { total: ((45 - station.pricing.penalty.grace_minutes) * station.pricing.penalty.penalty_cents_per_minute / 100).toFixed(2) })}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.bottomCta}>
        <TouchableOpacity
          style={[
            styles.startButton,
            availableCount === 0 && styles.startButtonDisabled,
          ]}
          onPress={() => {
            const availableCharger = station.chargers.find(c => c.status === 'AVAILABLE');
            if (availableCharger) {
              handleStartCharging(availableCharger);
            }
          }}
          disabled={availableCount === 0}
        >
          <Ionicons name="flash" size={22} color={availableCount > 0 ? '#000' : '#666'} />
          <Text style={[styles.startButtonText, availableCount === 0 && styles.startButtonTextDisabled]}>
            {availableCount > 0 ? t('station.startChargingNfc') : t('station.noChargersAvailable')}
          </Text>
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
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: '#1E1E1E',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerInfo: {
    flex: 1,
    marginRight: 12,
  },
  stationName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  stationAddress: {
    color: '#888',
    fontSize: 14,
  },
  availabilityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  availabilityText: {
    fontSize: 13,
    fontWeight: '600',
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    padding: 12,
    borderRadius: 10,
  },
  navigateText: {
    color: '#FFFFFF',
    fontSize: 15,
    flex: 1,
    marginLeft: 10,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  chargerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  chargerCardAvailable: {
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  chargerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  chargerDetails: {},
  chargerType: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  chargerPower: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  chargerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chargerStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  penaltyExplanation: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  penaltyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  penaltyTitle: {
    color: '#FF9800',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  penaltyContent: {
    marginBottom: 12,
  },
  penaltyItem: {
    color: '#B0B0B0',
    fontSize: 14,
    lineHeight: 22,
  },
  penaltyWarning: {
    color: '#FF9800',
  },
  penaltyExample: {
    backgroundColor: '#2A2A2A',
    padding: 12,
    borderRadius: 10,
  },
  penaltyExampleTitle: {
    color: '#FF9800',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  penaltyExampleText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
  },
  bottomCta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 32,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#2A2A2A',
  },
  startButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '600',
  },
  startButtonTextDisabled: {
    color: '#666',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    gap: 6,
  },
  actionText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  actionDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#3A3A3A',
  },
});
