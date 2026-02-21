import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSessionStore } from '../src/store/sessionStore';
import { useAuthStore } from '../src/store/authStore';
import { LoginWall } from '../src/components/LoginWall';
import PriceBreakdown from '../src/components/PriceBreakdown';

export default function PricingConfirmation() {
  const router = useRouter();
  const { selectedStation, selectedCharger, selectedPricing, startSession, clearSelection, isLoading } = useSessionStore();
  const { isGuest, isAuthenticated, user } = useAuthStore();
  const [starting, setStarting] = useState(false);
  const [showLoginWall, setShowLoginWall] = useState(false);

  if (!selectedStation || !selectedCharger || !selectedPricing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF5252" />
          <Text style={styles.errorText}>No charger selected</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleStartCharging = async () => {
    // Block guests
    if (isGuest) {
      setShowLoginWall(true);
      return;
    }

    // Check payment method
    if (!user?.payment_method_added) {
      Alert.alert(
        'Betaalmethode Vereist',
        'Je hebt een betaalmethode nodig om te laden.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Toevoegen', onPress: () => router.push('/add-payment') }
        ]
      );
      return;
    }

    setStarting(true);
    try {
      const sessionId = await startSession();
      router.replace({ pathname: '/live-session', params: { sessionId } });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to start charging session');
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = () => {
    Alert.alert('Cancel', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: () => { clearSelection(); router.back(); } }
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Guest Info Banner */}
        {isGuest && (
          <View style={styles.guestInfoBanner}>
            <Ionicons name="information-circle" size={20} color="#2196F3" />
            <View style={styles.guestInfoContent}>
              <Text style={styles.guestInfoTitle}>Prijsinformatie</Text>
              <Text style={styles.guestInfoText}>
                Je bekijkt de prijzen als gast. Log in om een laadsessie te starten.
              </Text>
            </View>
          </View>
        )}

        {/* Station Info */}
        <View style={styles.stationCard}>
          <View style={styles.stationHeader}>
            <View style={styles.iconBox}>
              <Ionicons name="location" size={24} color="#4CAF50" />
            </View>
            <View style={styles.stationInfo}>
              <Text style={styles.stationName}>{selectedStation.name}</Text>
              <Text style={styles.stationAddress}>{selectedStation.address}</Text>
            </View>
          </View>
          <View style={styles.chargerBadge}>
            <Ionicons name="flash" size={16} color="#FFC107" />
            <Text style={styles.chargerText}>
              {selectedCharger.connector_type} • {selectedCharger.max_kw} kW Max
            </Text>
          </View>
        </View>

        {/* Price Breakdown */}
        <Text style={styles.sectionTitle}>Pricing Details</Text>
        <PriceBreakdown
          startFeeCents={selectedPricing.start_fee_cents}
          energyRateCentsPerKwh={selectedPricing.energy_rate_cents_per_kwh}
          penalty={selectedPricing.penalty}
          taxPercent={selectedPricing.tax_percent}
          showExample={true}
        />

        {/* Confirmation Notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          <Text style={styles.noticeText}>
            These prices will be locked for your session. You'll see real-time costs while charging.
          </Text>
        </View>

        {/* Why Sign In - for guests */}
        {isGuest && (
          <View style={styles.whySignInBox}>
            <Text style={styles.whySignInTitle}>Waarom inloggen?</Text>
            <View style={styles.whySignInItem}>
              <Ionicons name="card" size={16} color="#888" />
              <Text style={styles.whySignInText}>Veilige betalingsverwerking</Text>
            </View>
            <View style={styles.whySignInItem}>
              <Ionicons name="receipt" size={16} color="#888" />
              <Text style={styles.whySignInText}>Digitale bonnetjes ontvangen</Text>
            </View>
            <View style={styles.whySignInItem}>
              <Ionicons name="stop-circle" size={16} color="#888" />
              <Text style={styles.whySignInText}>Sessie op afstand stoppen</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={starting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.startButton, starting && styles.buttonDisabled]}
          onPress={handleStartCharging}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color="#000" />
          ) : isGuest ? (
            <>
              <Ionicons name="log-in" size={20} color="#000" />
              <Text style={styles.startButtonText}>Inloggen om te Laden</Text>
            </>
          ) : (
            <>
              <Ionicons name="flash" size={20} color="#000" />
              <Text style={styles.startButtonText}>Start Charging</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Login Wall Modal */}
      <LoginWall
        visible={showLoginWall}
        onClose={() => setShowLoginWall(false)}
        actionType="start_session"
        returnTo="/pricing-confirmation"
        pendingData={{ stationId: selectedStation.id, chargerId: selectedCharger.id }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
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
  stationCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  stationAddress: {
    color: '#888',
    fontSize: 14,
  },
  chargerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  chargerText: {
    color: '#FFC107',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  noticeText: {
    color: '#B0B0B0',
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 10,
    flex: 1,
  },
  bottomButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    paddingBottom: 32,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  startButton: {
    flex: 2,
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  startButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '600',
  },
});
