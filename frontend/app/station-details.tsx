import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import PriceBreakdown from '../src/components/PriceBreakdown';
import { useSessionStore } from '../src/store/sessionStore';
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
  const { stationId } = useLocalSearchParams<{ stationId: string }>();
  const { resolveNfc } = useSessionStore();
  const [station, setStation] = useState<Station | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStation();
  }, [stationId]);

  const loadStation = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/api/stations/${stationId}`);
      setStation(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load station');
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
        Alert.alert('Error', 'Could not open maps');
      });
    }
  };

  const handleStartCharging = async (charger: Charger) => {
    if (charger.status !== 'AVAILABLE') {
      Alert.alert('Unavailable', `This charger is currently ${charger.status}`);
      return;
    }

    try {
      await resolveNfc(charger.nfc_payload);
      router.push('/pricing-confirmation');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || 'Failed to connect to charger');
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
          <Text style={styles.loadingText}>Loading station details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !station) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF5252" />
          <Text style={styles.errorText}>{error || 'Station not found'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
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
                {availableCount}/{totalCount} Available
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.navigateButton} onPress={handleNavigate}>
            <Ionicons name="navigate" size={20} color="#4CAF50" />
            <Text style={styles.navigateText}>Navigate to Station</Text>
            <Ionicons name="chevron-forward" size={16} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Chargers List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chargers</Text>
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
          <Text style={styles.sectionTitle}>Pricing Details</Text>
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
              <Text style={styles.penaltyTitle}>Idle Fee Details</Text>
            </View>
            <View style={styles.penaltyContent}>
              <Text style={styles.penaltyItem}>
                • Grace period: {station.pricing.penalty.grace_minutes} minutes after charging completes
              </Text>
              <Text style={styles.penaltyItem}>
                • Rate: €{(station.pricing.penalty.penalty_cents_per_minute / 100).toFixed(2)}/min while plugged in
              </Text>
              {station.pricing.penalty.daily_cap_cents ? (
                <Text style={styles.penaltyItem}>
                  • Maximum: €{(station.pricing.penalty.daily_cap_cents / 100).toFixed(0)} per day
                </Text>
              ) : (
                <Text style={[styles.penaltyItem, styles.penaltyWarning]}>
                  • No daily cap - unplug promptly to avoid high fees
                </Text>
              )}
            </View>
            <View style={styles.penaltyExample}>
              <Text style={styles.penaltyExampleTitle}>Example:</Text>
              <Text style={styles.penaltyExampleText}>
                If you stay plugged 45 minutes after charging completes:{'\n'}
                Penalty = (45 - {station.pricing.penalty.grace_minutes}) × €{(station.pricing.penalty.penalty_cents_per_minute / 100).toFixed(2)}/min{'\n'}
                = €{((45 - station.pricing.penalty.grace_minutes) * station.pricing.penalty.penalty_cents_per_minute / 100).toFixed(2)}
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
            {availableCount > 0 ? 'Start Charging via NFC' : 'No Chargers Available'}
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
});
