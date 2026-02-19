import React, { useEffect, useRef, useState, useCallback } from 'react';
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

// Conditionally import MapView only for native platforms
let MapView: any = null;
let Marker: any = null;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
}

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
  const mapRef = useRef<any>(null);
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
  const [bottomSheetExpanded, setBottomSheetExpanded] = useState(true);

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

  // Debounced region change handler
  const debouncedFetch = useCallback(
    debounce(() => {
      fetchNearbyStations();
    }, 500),
    []
  );

  const handleRegionChange = (newRegion: any) => {
    setRegion(newRegion);
    debouncedFetch();
  };

  const handleMarkerPress = (station: NearbyStation) => {
    selectStation(station);
    setBottomSheetExpanded(true);
  };

  const handleNavigate = (station: NearbyStation) => {
    const url = Platform.select({
      ios: `maps:?daddr=${station.latitude},${station.longitude}`,
      android: `geo:${station.latitude},${station.longitude}?q=${station.latitude},${station.longitude}(${encodeURIComponent(station.name)})`,
      web: `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`,
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

  const renderStationCard = (station: NearbyStation, index: number) => (
    <TouchableOpacity
      key={station.id}
      style={[
        styles.stationCard,
        selectedStation?.id === station.id && styles.stationCardSelected,
      ]}
      onPress={() => {
        selectStation(station);
        if (MapView && mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: station.latitude,
            longitude: station.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      }}
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

  // Web fallback - list only view
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Search Bar */}
        <View style={styles.webHeader}>
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
                {/* Connector Type */}
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel}>Connector</Text>
                  <View style={styles.filterChips}>
                    <TouchableOpacity
                      style={[
                        styles.chip,
                        !filters.connector_type && styles.chipActive,
                      ]}
                      onPress={() => setFilters({ connector_type: null })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          !filters.connector_type && styles.chipTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </TouchableOpacity>
                    {CONNECTOR_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.chip,
                          filters.connector_type === type && styles.chipActive,
                        ]}
                        onPress={() => setFilters({ connector_type: type })}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            filters.connector_type === type && styles.chipTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Power */}
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel}>Power</Text>
                  <View style={styles.filterChips}>
                    {POWER_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.label}
                        style={[
                          styles.chip,
                          filters.min_power_kw === opt.value && styles.chipActive,
                        ]}
                        onPress={() => setFilters({ min_power_kw: opt.value })}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            filters.min_power_kw === opt.value && styles.chipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Available Only */}
                <View style={styles.filterGroup}>
                  <Text style={styles.filterLabel}>Status</Text>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      filters.available_only && styles.chipActive,
                    ]}
                    onPress={() => setFilters({ available_only: !filters.available_only })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        filters.available_only && styles.chipTextActive,
                      ]}
                    >
                      Available Now
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {/* Sort */}
              <View style={styles.sortContainer}>
                <Text style={styles.filterLabel}>Sort by:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {SORT_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.sortChip,
                        filters.sort_by === opt.value && styles.sortChipActive,
                      ]}
                      onPress={() => setFilters({ sort_by: opt.value as any })}
                    >
                      <Text
                        style={[
                          styles.sortChipText,
                          filters.sort_by === opt.value && styles.sortChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}

          <Text style={styles.webTitle}>
            {nearbyStations.length} Charging Stations Near Rotterdam
          </Text>
        </View>

        {/* Station List */}
        <ScrollView style={styles.webStationList} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
          ) : nearbyStations.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="location-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>No stations found</Text>
            </View>
          ) : (
            nearbyStations.map((station, index) => renderStationCard(station, index))
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Native Map View
  return (
    <View style={styles.container}>
      {/* Map */}
      {MapView && (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          onRegionChangeComplete={handleRegionChange}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {nearbyStations.map((station) => (
            <Marker
              key={station.id}
              coordinate={{
                latitude: station.latitude,
                longitude: station.longitude,
              }}
              onPress={() => handleMarkerPress(station)}
            >
              <View style={[styles.marker, { backgroundColor: getMarkerColor(station) }]}>
                <Ionicons name="flash" size={16} color="#FFF" />
                <Text style={styles.markerText}>
                  {station.availability.available_count}
                </Text>
              </View>
            </Marker>
          ))}
        </MapView>
      )}

      {/* Search Bar */}
      <SafeAreaView style={styles.searchContainer} edges={['top']}>
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
              {/* Connector Type */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Connector</Text>
                <View style={styles.filterChips}>
                  <TouchableOpacity
                    style={[
                      styles.chip,
                      !filters.connector_type && styles.chipActive,
                    ]}
                    onPress={() => setFilters({ connector_type: null })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        !filters.connector_type && styles.chipTextActive,
                      ]}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {CONNECTOR_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.chip,
                        filters.connector_type === type && styles.chipActive,
                      ]}
                      onPress={() => setFilters({ connector_type: type })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          filters.connector_type === type && styles.chipTextActive,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Power */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Power</Text>
                <View style={styles.filterChips}>
                  {POWER_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.chip,
                        filters.min_power_kw === opt.value && styles.chipActive,
                      ]}
                      onPress={() => setFilters({ min_power_kw: opt.value })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          filters.min_power_kw === opt.value && styles.chipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Available Only */}
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Status</Text>
                <TouchableOpacity
                  style={[
                    styles.chip,
                    filters.available_only && styles.chipActive,
                  ]}
                  onPress={() => setFilters({ available_only: !filters.available_only })}
                >
                  <Text
                    style={[
                      styles.chipText,
                      filters.available_only && styles.chipTextActive,
                    ]}
                  >
                    Available Now
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Sort */}
            <View style={styles.sortContainer}>
              <Text style={styles.filterLabel}>Sort by:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.sortChip,
                      filters.sort_by === opt.value && styles.sortChipActive,
                    ]}
                    onPress={() => setFilters({ sort_by: opt.value as any })}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        filters.sort_by === opt.value && styles.sortChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* My Location Button */}
      <TouchableOpacity
        style={styles.myLocationButton}
        onPress={async () => {
          if (userLocation && mapRef.current) {
            mapRef.current.animateToRegion({
              ...region,
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            });
          }
        }}
      >
        <Ionicons name="locate" size={24} color="#4CAF50" />
      </TouchableOpacity>

      {/* Bottom Sheet - Station List */}
      <View
        style={[
          styles.bottomSheet,
          bottomSheetExpanded ? styles.bottomSheetExpanded : styles.bottomSheetCollapsed,
        ]}
      >
        <TouchableOpacity
          style={styles.bottomSheetHandle}
          onPress={() => setBottomSheetExpanded(!bottomSheetExpanded)}
        >
          <View style={styles.handleBar} />
          <Text style={styles.bottomSheetTitle}>
            {nearbyStations.length} Stations Nearby
          </Text>
          <Ionicons
            name={bottomSheetExpanded ? 'chevron-down' : 'chevron-up'}
            size={20}
            color="#888"
          />
        </TouchableOpacity>

        {bottomSheetExpanded && (
          <ScrollView
            style={styles.stationList}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
            ) : nearbyStations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={48} color="#444" />
                <Text style={styles.emptyText}>No stations found nearby</Text>
              </View>
            ) : (
              nearbyStations.map((station, index) => renderStationCard(station, index))
            )}
            <View style={styles.bottomPadding} />
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  webHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  webTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  webStationList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
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
  myLocationButton: {
    position: 'absolute',
    right: 16,
    bottom: height * 0.45 + 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  marker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  markerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  bottomSheetExpanded: {
    height: height * 0.45,
  },
  bottomSheetCollapsed: {
    height: 60,
  },
  bottomSheetHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -20,
  },
  bottomSheetTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stationList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loader: {
    marginTop: 32,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
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
