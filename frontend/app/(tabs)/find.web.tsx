/**
 * Web-only version of the Find screen.
 * react-native-maps is a native-only module and cannot run in a web build.
 * This file is automatically preferred over find.tsx on the web platform.
 * Map view is replaced with a simple notice; all list functionality is intact.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMapStore, NearbyStation } from '../../src/store/mapStore';
import { useFavoriteStore } from '../../src/store/favoriteStore';
import { useAlertStore } from '../../src/store/alertStore';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../src/i18n';

const CONNECTOR_TYPES = ['CCS', 'CHAdeMO', 'Type2'];
type ViewMode = 'list' | 'map';

export default function FindScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    nearbyStations,
    filters,
    isLoading,
    error,
    setFilters,
    fetchNearbyStations,
    clearError,
  } = useMapStore();

  const { isFavorited, addFavorite, removeFavorite, loadFavorites } = useFavoriteStore();
  const { hasAlert, setAlert, cancelAlert, loadAlerts } = useAlertStore();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const POWER_OPTIONS = [
    { label: t('map.all'), value: null },
    { label: '7+ kW', value: 7 },
    { label: '50+ kW', value: 50 },
    { label: '150+ kW', value: 150 },
  ];

  const SORT_OPTIONS = [
    { label: t('map.sortDistance'), value: 'distance' },
    { label: t('map.sortPrice'), value: 'price' },
    { label: t('map.sortPower'), value: 'power' },
  ];

  useEffect(() => {
    fetchNearbyStations();
    loadFavorites();
    loadAlerts();
  }, []);

  const handleNavigate = (station: NearbyStation) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`;
    Linking.openURL(url).catch(() => Alert.alert(t('common.error'), t('errors.generic')));
  };

  const handleViewDetails = (station: NearbyStation) => {
    router.push({ pathname: '/station-details', params: { stationId: station.id } });
  };

  const getAvailabilityColor = (station: NearbyStation) => {
    const { available_count, total_count } = station.availability;
    if (available_count === 0) return '#FF5252';
    if (available_count < total_count) return '#FF9800';
    return '#4CAF50';
  };

  const filteredStations = nearbyStations.filter(station => {
    if (showFavoritesOnly && !isFavorited(station.id)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return station.name.toLowerCase().includes(q) || station.address.toLowerCase().includes(q);
  });

  // ─── Filters panel ────────────────────────────────────────────────────────
  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{t('map.connectorType')}</Text>
          <View style={styles.filterChips}>
            <TouchableOpacity
              style={[styles.chip, !filters.connector_type && styles.chipActive]}
              onPress={() => setFilters({ connector_type: null })}
            >
              <Text style={[styles.chipText, !filters.connector_type && styles.chipTextActive]}>{t('map.all')}</Text>
            </TouchableOpacity>
            {CONNECTOR_TYPES.map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, filters.connector_type === type && styles.chipActive]}
                onPress={() => setFilters({ connector_type: type })}
              >
                <Text style={[styles.chipText, filters.connector_type === type && styles.chipTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{t('map.minPower')}</Text>
          <View style={styles.filterChips}>
            {POWER_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.label}
                style={[styles.chip, filters.min_power_kw === opt.value && styles.chipActive]}
                onPress={() => setFilters({ min_power_kw: opt.value })}
              >
                <Text style={[styles.chipText, filters.min_power_kw === opt.value && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{t('map.status')}</Text>
          <TouchableOpacity
            style={[styles.chip, filters.available_only && styles.chipActive]}
            onPress={() => setFilters({ available_only: !filters.available_only })}
          >
            <Text style={[styles.chipText, filters.available_only && styles.chipTextActive]}>{t('map.availableOnly')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.sortContainer}>
        <Text style={styles.filterLabel}>{t('map.sortBy')}:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.sortChip, filters.sort_by === opt.value && styles.sortChipActive]}
              onPress={() => setFilters({ sort_by: opt.value as any })}
            >
              <Text style={[styles.sortChipText, filters.sort_by === opt.value && styles.sortChipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  // ─── List station card ─────────────────────────────────────────────────────
  const renderStationCard = (station: NearbyStation) => {
    const color = getAvailabilityColor(station);
    return (
      <TouchableOpacity
        key={station.id}
        style={styles.stationCard}
        onPress={() => handleViewDetails(station)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>{station.name}</Text>
            <View style={styles.cardTitleIcons}>
              <TouchableOpacity
                style={styles.cardIconBtn}
                onPress={(e) => { e.stopPropagation(); isFavorited(station.id) ? removeFavorite(station.id) : addFavorite(station.id); }}
              >
                <Ionicons
                  name={isFavorited(station.id) ? 'star' : 'star-outline'}
                  size={18}
                  color={isFavorited(station.id) ? '#FFD700' : '#555'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cardIconBtn}
                onPress={(e) => { e.stopPropagation(); hasAlert(station.id) ? cancelAlert(station.id) : setAlert(station.id); }}
              >
                <Ionicons
                  name={hasAlert(station.id) ? 'notifications' : 'notifications-outline'}
                  size={18}
                  color={hasAlert(station.id) ? '#4CAF50' : '#555'}
                />
              </TouchableOpacity>
              <View style={[styles.availabilityBadge, { backgroundColor: color + '30' }]}>
                <Text style={[styles.availabilityText, { color }]}>
                  {station.availability.available_count}/{station.availability.total_count}
                </Text>
              </View>
            </View>
          </View>
          <Text style={styles.cardAddress} numberOfLines={1}>{station.address}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardDistance}>{station.distance_km.toFixed(1)} {t('common.km')}</Text>
            <Text style={styles.cardDot}>•</Text>
            <Text style={styles.cardPower}>{station.max_power_kw} {t('common.kw')} max</Text>
          </View>
        </View>

        <View style={styles.pricingRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>{t('pricing.startFee')}</Text>
            <Text style={styles.priceValue}>
              {station.pricing_summary.start_fee_cents === 0 ? t('pricing.free') : formatCurrency(station.pricing_summary.start_fee_cents)}
            </Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>{t('pricing.energyRate')}</Text>
            <Text style={styles.priceValue}>
              {formatCurrency(station.pricing_summary.energy_rate_cents_per_kwh)}{t('common.perKwh')}
            </Text>
          </View>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>20 {t('common.kwh')}</Text>
            <Text style={styles.priceValueHighlight}>~{formatCurrency(station.pricing_summary.estimated_20kwh_cents)}</Text>
          </View>
        </View>

        {station.pricing_summary.penalty_enabled && (
          <View style={styles.penaltyRow}>
            <Ionicons name="warning" size={14} color="#FF9800" />
            <Text style={styles.penaltyText} numberOfLines={1}>{station.pricing_summary.penalty_summary}</Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => handleNavigate(station)}>
            <Ionicons name="navigate" size={18} color="#4CAF50" />
            <Text style={styles.actionText}>{t('map.navigate')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.actionButtonPrimary]} onPress={() => handleViewDetails(station)}>
            <Ionicons name="information-circle" size={18} color="#000" />
            <Text style={styles.actionTextPrimary}>{t('map.details')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder={t('map.searchPlaceholder')}
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity style={styles.filterButton} onPress={() => setShowFilters(v => !v)}>
            <Ionicons name="options" size={20} color={showFilters ? '#4CAF50' : '#888'} />
          </TouchableOpacity>
        </View>

        {showFilters && renderFilters()}

        {/* List / Map toggle */}
        <View style={styles.toggleRow}>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
              onPress={() => setViewMode('list')}
            >
              <Ionicons name="list" size={15} color={viewMode === 'list' ? '#000' : '#888'} />
              <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>{t('map.listView')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
              onPress={() => setViewMode('map')}
            >
              <Ionicons name="map-outline" size={15} color={viewMode === 'map' ? '#000' : '#888'} />
              <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>{t('map.mapView')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.rightToggleRow}>
            <TouchableOpacity
              style={[styles.favoritesToggle, showFavoritesOnly && styles.favoritesToggleActive]}
              onPress={() => setShowFavoritesOnly(v => !v)}
            >
              <Ionicons
                name={showFavoritesOnly ? 'star' : 'star-outline'}
                size={14}
                color={showFavoritesOnly ? '#000' : '#888'}
              />
              <Text style={[styles.favoritesToggleText, showFavoritesOnly && styles.favoritesToggleTextActive]}>
                {t('map.saved')}
              </Text>
            </TouchableOpacity>
            <Text style={styles.countText}>{filteredStations.length}</Text>
          </View>
        </View>
      </View>

      {/* Content area */}
      {viewMode === 'map' ? (
        <View style={styles.mapUnavailable}>
          <Ionicons name="map-outline" size={52} color="#333" />
          <Text style={styles.mapUnavailableTitle}>Map not available on web</Text>
          <Text style={styles.mapUnavailableSubtext}>Use the mobile app for interactive map view</Text>
          <TouchableOpacity style={styles.switchToListBtn} onPress={() => setViewMode('list')}>
            <Text style={styles.switchToListBtnText}>Show list</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.stationList} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
          ) : error ? (
            <View style={styles.emptyState}>
              <Ionicons name="wifi-outline" size={48} color="#FF5252" />
              <Text style={styles.emptyText}>{t('errors.network')}</Text>
              <Text style={styles.emptySubtext}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => { clearError(); fetchNearbyStations(); }}>
                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : filteredStations.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="location-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>{t('map.noStationsFound')}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchNearbyStations}>
                <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredStations.map(renderStationCard)
          )}
          <View style={styles.bottomPadding} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },

  // ─── Header ────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  searchInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 15,
    marginLeft: 10,
  },
  filterButton: { padding: 8 },

  // ─── Filters ──────────────────────────────────────────────────────────────
  filtersContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginTop: 8,
    padding: 12,
  },
  filterGroup: { marginRight: 16 },
  filterLabel: { color: '#888', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterChips: { flexDirection: 'row', gap: 6 },
  chip: { backgroundColor: '#2A2A2A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipActive: { backgroundColor: '#4CAF50' },
  chipText: { color: '#AAA', fontSize: 13 },
  chipTextActive: { color: '#000', fontWeight: '600' },
  sortContainer: { marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  sortChip: { backgroundColor: '#2A2A2A', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, marginRight: 8 },
  sortChipActive: { backgroundColor: 'rgba(76,175,80,0.2)', borderWidth: 1, borderColor: '#4CAF50' },
  sortChipText: { color: '#AAA', fontSize: 13 },
  sortChipTextActive: { color: '#4CAF50', fontWeight: '600' },

  // ─── Toggle ───────────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 3,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  toggleBtnActive: { backgroundColor: '#4CAF50' },
  toggleText: { color: '#888', fontSize: 14, fontWeight: '500' },
  toggleTextActive: { color: '#000', fontWeight: '700' },
  countText: { color: '#555', fontSize: 13 },

  // ─── List mode ────────────────────────────────────────────────────────────
  stationList: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  loader: { marginTop: 40 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#666', fontSize: 18, marginTop: 16 },
  emptySubtext: { color: '#555', fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  retryButton: { marginTop: 20, backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 28, borderRadius: 8 },
  retryButtonText: { color: '#000', fontSize: 15, fontWeight: '600' },
  bottomPadding: { height: 20 },

  stationCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { marginBottom: 10 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { color: '#FFF', fontSize: 16, fontWeight: '600', flex: 1 },
  availabilityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 8 },
  availabilityText: { fontSize: 12, fontWeight: '700' },
  cardAddress: { color: '#888', fontSize: 13, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', alignItems: 'center' },
  cardDistance: { color: '#4CAF50', fontSize: 13, fontWeight: '500' },
  cardDot: { color: '#666', marginHorizontal: 6 },
  cardPower: { color: '#FFC107', fontSize: 13 },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  priceItem: { alignItems: 'center' },
  priceLabel: { color: '#888', fontSize: 11, marginBottom: 2 },
  priceValue: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  priceValueHighlight: { color: '#4CAF50', fontSize: 14, fontWeight: '700' },
  penaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,152,0,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 10,
  },
  penaltyText: { color: '#FF9800', fontSize: 12, marginLeft: 6, flex: 1 },
  cardActions: { flexDirection: 'row', gap: 10 },
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
  actionButtonPrimary: { backgroundColor: '#4CAF50' },
  actionText: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  actionTextPrimary: { color: '#000', fontSize: 14, fontWeight: '600' },

  // ─── Map unavailable ──────────────────────────────────────────────────────
  mapUnavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  mapUnavailableTitle: {
    color: '#555',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  mapUnavailableSubtext: {
    color: '#444',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  switchToListBtn: {
    marginTop: 24,
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  switchToListBtnText: { color: '#000', fontSize: 15, fontWeight: '600' },

  // ─── Favorites toggle & card icons ────────────────────────────────────────
  rightToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  favoritesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  favoritesToggleActive: {
    backgroundColor: '#FFD700',
  },
  favoritesToggleText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  favoritesToggleTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  cardTitleIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardIconBtn: {
    padding: 4,
  },
});
