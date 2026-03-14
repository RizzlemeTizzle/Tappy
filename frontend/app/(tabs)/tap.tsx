import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { showAlert } from '../../src/utils/alert';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useSessionStore } from '../../src/store/sessionStore';
import { LoginWall } from '../../src/components/LoginWall';
import { useTranslation } from 'react-i18next';

export default function TapScreen() {
  const router = useRouter();
  const { user, isGuest, isAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const {
    resolveNfc,
    fetchStations,
    stations,
    isLoading,
    clearSelection
  } = useSessionStore();

  const [showStationPicker, setShowStationPicker] = useState(false);
  const [isTapping, setIsTapping] = useState(false);
  const [showLoginWall, setShowLoginWall] = useState(false);
  const [pendingChargerPayload, setPendingChargerPayload] = useState<string | null>(null);

  useEffect(() => {
    fetchStations();
    clearSelection();
  }, []);

  const simulateNfcTap = async (nfcPayload: string) => {
    setIsTapping(true);
    try {
      await resolveNfc(nfcPayload);
      router.push('/pricing-confirmation');
    } catch (err: any) {
      showAlert(t('common.error'), err.response?.data?.error || err.message || t('errors.chargerNotAvailable'));
    } finally {
      setIsTapping(false);
    }
  };

  const handleTap = () => {
    setShowStationPicker(true);
  };

  const handleSelectCharger = (charger: any) => {
    setShowStationPicker(false);
    simulateNfcTap(charger.nfc_payload);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        {/* Guest mode banner */}
        {isGuest && (
          <View style={styles.guestBanner}>
            <Ionicons name="eye-outline" size={18} color="#FFC107" />
            <Text style={styles.guestBannerText}>
              {t('guest.banner')}
            </Text>
            <TouchableOpacity onPress={() => setShowLoginWall(true)}>
              <Text style={styles.guestBannerLink}>{t('guest.signIn')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.tapSection}>
          <Text style={styles.readyText}>{t('tap.title')}</Text>
          <Text style={styles.instructionText}>
            {isGuest 
              ? t('tap.instructionGuest')
              : t('tap.instruction')
            }
          </Text>

          <TouchableOpacity
            style={[styles.tapButton, isTapping && styles.tapButtonActive]}
            onPress={handleTap}
            disabled={isTapping}
          >
            {isTapping ? (
              <ActivityIndicator size="large" color="#0A0A0A" />
            ) : (
              <>
                <Ionicons name="phone-portrait" size={64} color="#0A0A0A" />
                <Text style={styles.tapButtonText}>
                  {isGuest ? t('guest.viewPricing') : t('tap.simulateTap')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.nfcNote}>
            <Ionicons name="information-circle" size={18} color="#666" />
            <Text style={styles.nfcNoteText}>
              {t('tap.productionNote')}
            </Text>
          </View>
        </View>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="flash" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>{t('onboarding.feature1Title')}</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="pricetag" size={24} color="#FFC107" />
            <Text style={styles.featureText}>{t('onboarding.feature2Title')}</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color="#2196F3" />
            <Text style={styles.featureText}>{t('payment.processing')}</Text>
          </View>
        </View>
      </View>

      {/* Station Picker Modal */}
      <Modal
        visible={showStationPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStationPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('tap.selectCharger')}</Text>
              <TouchableOpacity onPress={() => setShowStationPicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>{t('tap.productionNote')}</Text>

            {isLoading ? (
              <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
            ) : (
              <FlatList
                data={stations}
                keyExtractor={(item) => item.id}
                renderItem={({ item: station }) => (
                  <View style={styles.stationCard}>
                    <View style={styles.stationHeader}>
                      <Ionicons name="location" size={20} color="#4CAF50" />
                      <Text style={styles.stationName}>{station.name}</Text>
                    </View>
                    <Text style={styles.stationAddress}>{station.address}</Text>
                    <View style={styles.chargerList}>
                      {station.chargers?.map((charger: any) => (
                        <TouchableOpacity
                          key={charger.id}
                          style={[
                            styles.chargerItem,
                            charger.status !== 'AVAILABLE' && styles.chargerUnavailable
                          ]}
                          onPress={() => handleSelectCharger(charger)}
                          disabled={charger.status !== 'AVAILABLE'}
                        >
                          <View style={styles.chargerInfo}>
                            <Ionicons
                              name="flash"
                              size={18}
                              color={charger.status === 'AVAILABLE' ? '#4CAF50' : '#666'}
                            />
                            <View>
                              <Text style={[
                                styles.chargerType,
                                charger.status !== 'AVAILABLE' && styles.chargerTypeUnavailable
                              ]}>
                                {charger.connector_type} • {charger.max_kw} {t('common.kw')}
                              </Text>
                              <Text style={[
                                styles.chargerStatus,
                                charger.status === 'AVAILABLE' ? styles.statusAvailable : styles.statusUnavailable
                              ]}>
                                {charger.status === 'AVAILABLE' ? t('charger.available') : t('charger.occupied')}
                              </Text>
                            </View>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={charger.status === 'AVAILABLE' ? '#4CAF50' : '#444'}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                contentContainerStyle={styles.stationList}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Login Wall Modal */}
      <LoginWall
        visible={showLoginWall}
        onClose={() => setShowLoginWall(false)}
        actionType="start_session"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: 32,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  guestBannerText: {
    color: '#FFC107',
    fontSize: 13,
    flex: 1,
  },
  guestBannerLink: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
  },
  tapSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  readyText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  tapButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapButtonActive: {
    backgroundColor: '#66BB6A',
  },
  tapButtonText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  nfcNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    paddingHorizontal: 20,
  },
  nfcNoteText: {
    color: '#666',
    fontSize: 13,
    marginLeft: 8,
    textAlign: 'center',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
  },
  featureItem: {
    alignItems: 'center',
  },
  featureText: {
    color: '#888',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 80,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#888',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  loader: {
    padding: 40,
  },
  stationList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  stationCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stationName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  stationAddress: {
    color: '#888',
    fontSize: 13,
    marginBottom: 12,
    marginLeft: 28,
  },
  chargerList: {
    gap: 8,
  },
  chargerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 10,
  },
  chargerUnavailable: {
    opacity: 0.5,
  },
  chargerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chargerType: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  chargerTypeUnavailable: {
    color: '#666',
  },
  chargerStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  statusAvailable: {
    color: '#4CAF50',
  },
  statusUnavailable: {
    color: '#FF5252',
  },
});
