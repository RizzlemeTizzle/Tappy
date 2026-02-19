import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useMapStore, NearbyStation } from '../../src/store/mapStore';
import debounce from 'lodash/debounce';

const { width, height } = Dimensions.get('window');

const CONNECTOR_TYPES = ['CCS', 'CHAdeMO', 'Type2'];
const POWER_OPTIONS = [
  { label: 'Any', value: null },
  { label: '7+ kW', value: 7 },
  { label: '50+ kW', value: 50 },
  { label: '150+ kW', value: 150 },
];
const SORT_OPTIONS = [
  { label: 'Nearest', value: 'distance' },
  { label: 'Cheapest', value: 'price' },
  { label: 'Fastest', value: 'power' },
  { label: 'Best Value', value: 'estimated_cost' },
];

export default function FindScreen() {
  const router = useRouter();
  const {
    nearbyStations,
    selectedStation,
    userLocation,
    region,
    filters,
    isLoading,
    setUserLocation,
    setRegion,
    setFilters,
    selectStation,
    fetchNearbyStations,
  } = useMapStore();

  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      }
      fetchNearbyStations();
    })();
  }, []);

  const handleNavigate = (station: NearbyStation) => {
    const url = Platform.select({
      ios: `maps:?daddr=${station.latitude},${station.longitude}`,
      android: `geo:${station.latitude},${station.longitude}?q=${station.latitude},${station.longitude}(${encodeURIComponent(station.name)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`,
    });

    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Error', 'Could not open maps');
      });
    }
  };

  const handleViewDetails = (station: NearbyStation) => {
    router.push({ pathname: '/station-details', params: { stationId: station.id } });
  };

  const formatPrice = (cents: number) => `€${(cents / 100).toFixed(2)}`;

  const getMarkerColor = (station: NearbyStation) => {
    const { available_count, total_count } = station.availability;
    if (available_count === 0) return '#FF5252';
    if (available_count < total_count / 2) return '#FF9800';
    return '#4CAF50';
  };

  const filteredStations = nearbyStations.filter(station => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      station.name.toLowerCase().includes(query) ||
      station.address.toLowerCase().includes(query)
    );
  });

  const renderStationCard = (station: NearbyStation) => (
    <TouchableOpacity
      key={station.id}
      style={[
        styles.stationCard,
        selectedStation?.id === station.id && styles.stationCardSelected,
      ]}
      onPress={() => selectStation(station)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{station.name}</Text>
          <View style={[
            styles.availabilityBadge,
            { backgroundColor: getMarkerColor(station) + '30' }
          ]}>
            <Text style={[styles.availabilityText, { color: getMarkerColor(station) }]}>
              {station.availability.available_count}/{station.availability.total_count}
            </Text>
          </View>
        </View>
        <Text style={styles.cardAddress} numberOfLines={1}>{station.address}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardDistance}>{station.distance_km.toFixed(1)} km</Text>
          <Text style={styles.cardDot}>•</Text>
          <Text style={styles.cardPower}>{station.max_power_kw} kW max</Text>
        </View>
      </View>

      <View style={styles.pricingRow}>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Start</Text>
          <Text style={styles.priceValue}>
            {station.pricing_summary.start_fee_cents === 0
              ? 'Free'
              : formatPrice(station.pricing_summary.start_fee_cents)}
          </Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>Rate</Text>
          <Text style={styles.priceValue}>
            {formatPrice(station.pricing_summary.energy_rate_cents_per_kwh)}/kWh
          </Text>
        </View>
        <View style={styles.priceItem}>
          <Text style={styles.priceLabel}>20 kWh</Text>
          <Text style={styles.priceValueHighlight}>
            ~{formatPrice(station.pricing_summary.estimated_20kwh_cents)}
          </Text>
        </View>
      </View>

      {station.pricing_summary.penalty_enabled && (
        <View style={styles.penaltyRow}>
          <Ionicons name="warning" size={14} color="#FF9800" />
          <Text style={styles.penaltyText} numberOfLines={1}>
            {station.pricing_summary.penalty_summary}
          </Text>
        </View>
      )}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleNavigate(station)}
        >
          <Ionicons name="navigate" size={18} color="#4CAF50" />
          <Text style={styles.actionText}>Navigate</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionButtonPrimary]}
          onPress={() => handleViewDetails(station)}
        >
          <Ionicons name="information-circle" size={18} color="#000" />
          <Text style={styles.actionTextPrimary}>Details</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Search */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search stations..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons
              name="options"
              size={20}
              color={showFilters ? '#4CAF50' : '#888'}
            />
          </TouchableOpacity>
        </View>

        {/* Filters */}
        {showFilters && (
          <View style={styles.filtersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Connector</Text>
                <View style={styles.filterChips}>
                  <TouchableOpacity
                    style={[styles.chip, !filters.connector_type && styles.chipActive]}
                    onPress={() => setFilters({ connector_type: null })}
                  >
                    <Text style={[styles.chipText, !filters.connector_type && styles.chipTextActive]}>
                      All
                    </Text>
                  </TouchableOpacity>
                  {CONNECTOR_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.chip, filters.connector_type === type && styles.chipActive]}
                      onPress={() => setFilters({ connector_type: type })}
                    >
                      <Text style={[styles.chipText, filters.connector_type === type && styles.chipTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Power</Text>
                <View style={styles.filterChips}>
                  {POWER_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[styles.chip, filters.min_power_kw === opt.value && styles.chipActive]}
                      onPress={() => setFilters({ min_power_kw: opt.value })}
                    >
                      <Text style={[styles.chipText, filters.min_power_kw === opt.value && styles.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Status</Text>
                <TouchableOpacity
                  style={[styles.chip, filters.available_only && styles.chipActive]}
                  onPress={() => setFilters({ available_only: !filters.available_only })}
                >
                  <Text style={[styles.chipText, filters.available_only && styles.chipTextActive]}>
                    Available Now
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.sortContainer}>
              <Text style={styles.filterLabel}>Sort by:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.sortChip, filters.sort_by === opt.value && styles.sortChipActive]}
                    onPress={() => setFilters({ sort_by: opt.value as any })}
                  >
                    <Text style={[styles.sortChipText, filters.sort_by === opt.value && styles.sortChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {filteredStations.length} Charging Stations
          </Text>
          <Text style={styles.subtitle}>Near Rotterdam, NL</Text>
        </View>
      </View>

      {/* Station List */}
      <ScrollView style={styles.stationList} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
        ) : filteredStations.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color="#444" />
            <Text style={styles.emptyText}>No stations found</Text>
            <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
          </View>
        ) : (
          filteredStations.map((station) => renderStationCard(station))
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    marginLeft: 10,
  },
  filterButton: {
    padding: 8,
  },
  filtersContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginTop: 8,
    padding: 12,
  },
  filterGroup: {
    marginRight: 16,
  },
  filterLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  chipActive: {
    backgroundColor: '#4CAF50',
  },
  chipText: {
    color: '#AAA',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  sortContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortChip: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  sortChipActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  sortChipText: {
    color: '#AAA',
    fontSize: 13,
  },
  sortChipTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  titleRow: {
    marginTop: 12,
  },
  title: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  stationList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loader: {
    marginTop: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#555',
    fontSize: 14,
    marginTop: 4,
  },
  stationCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  stationCardSelected: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cardHeader: {
    marginBottom: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  availabilityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  availabilityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardAddress: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardDistance: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '500',
  },
  cardDot: {
    color: '#666',
    marginHorizontal: 6,
  },
  cardPower: {
    color: '#FFC107',
    fontSize: 13,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  priceItem: {
    alignItems: 'center',
  },
  priceLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 2,
  },
  priceValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  priceValueHighlight: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '700',
  },
  penaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  penaltyText: {
    color: '#FF9800',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    gap: 6,
  },
  actionButtonPrimary: {
    backgroundColor: '#4CAF50',
  },
  actionText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  actionTextPrimary: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 20,
  },
});
