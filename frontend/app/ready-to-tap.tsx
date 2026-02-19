import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { useSessionStore } from '../src/store/sessionStore';

export default function ReadyToTap() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { 
    resolveNfc, 
    fetchStations, 
    stations, 
    isLoading, 
    error,
    setError,
    clearSelection 
  } = useSessionStore();
  
  const [showStationPicker, setShowStationPicker] = useState(false);
  const [isTapping, setIsTapping] = useState(false);

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
      Alert.alert('Error', err.response?.data?.detail || 'Failed to connect to charger');
    } finally {
      setIsTapping(false);
    }
  };

  const handleTap = () => {
    // Simulate NFC tap by showing station picker
    setShowStationPicker(true);
  };

  const handleSelectCharger = (charger: any) => {
    setShowStationPicker(false);
    simulateNfcTap(charger.nfc_payload);
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: logout }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#4CAF50" />
          </View>
          <View>
            <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0]}</Text>
            <Text style={styles.cardInfo}>Card •••• {user?.payment_method_last4}</Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={() => router.push('/history')}
          >
            <Ionicons name="receipt" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.iconButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <View style={styles.tapSection}>
          <Text style={styles.readyText}>Ready to Charge</Text>
          <Text style={styles.instructionText}>
            Tap your phone on the charger's NFC reader to begin
          </Text>

          {/* Tap Button */}
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
                <Text style={styles.tapButtonText}>Tap Here to Simulate NFC</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.nfcNote}>
            <Ionicons name="information-circle" size={18} color="#666" />
            <Text style={styles.nfcNoteText}>
              In production, you would tap your phone on the physical charger
            </Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="flash" size={24} color="#4CAF50" />
            <Text style={styles.featureText}>Instant Connection</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="pricetag" size={24} color="#FFC107" />
            <Text style={styles.featureText}>Transparent Pricing</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color="#2196F3" />
            <Text style={styles.featureText}>Secure Payment</Text>
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
              <Text style={styles.modalTitle}>Select a Charger</Text>
              <TouchableOpacity onPress={() => setShowStationPicker(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Simulating NFC tap detection</Text>

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
                                {charger.connector_type} • {charger.max_kw} kW
                              </Text>
                              <Text style={[
                                styles.chargerStatus,
                                charger.status === 'AVAILABLE' ? styles.statusAvailable : styles.statusUnavailable
                              ]}>
                                {charger.status}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  greeting: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cardInfo: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: 32,
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
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 10,
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
