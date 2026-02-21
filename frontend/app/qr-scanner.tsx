import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { getApiUrl } from '../src/utils/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

interface QRResolveResponse {
  qr_valid: boolean;
  charger: {
    id: string;
    evse_uid: string;
    connector_id: string;
    connector_type: string;
    max_kw: number;
    status: string;
  };
  station: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  tariff: {
    start_fee_cents: number;
    energy_rate_cents_per_kwh: number;
    tax_percent: number;
    penalty_enabled: boolean;
    penalty_grace_minutes: number;
    penalty_cents_per_minute: number;
  };
  estimate: {
    target_kwh: number;
    estimated_minutes: number;
    total_cents: number;
    total_display: string;
  };
  cpo: string;
}

export default function QRScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { token } = useAuthStore();
  
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvedData, setResolvedData] = useState<QRResolveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashEnabled, setFlashEnabled] = useState(false);
  
  // Handle deep link payload if present
  useEffect(() => {
    if (params.payload && typeof params.payload === 'string') {
      handleQRPayload(params.payload);
    }
  }, [params.payload]);
  
  const sendTelemetry = async (event: string, data: Record<string, any> = {}) => {
    try {
      await fetch(`${getApiUrl()}/api/v1/qr/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, ...data }),
      });
    } catch {
      // Ignore telemetry errors
    }
  };
  
  const handleQRPayload = async (payload: string) => {
    if (scanned || loading) return;
    
    setScanned(true);
    setLoading(true);
    setError(null);
    
    try {
      // Extract query string from deep link or URL
      let queryString = payload;
      if (payload.includes('?')) {
        queryString = payload.split('?')[1];
      }
      
      // Call backend to resolve and validate
      const response = await fetch(
        `${getApiUrl()}/api/v1/qr/resolve?payload=${encodeURIComponent(queryString)}`
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        await sendTelemetry('qr_scanned', { success: false, error: data.error });
        
        const errorMessages: Record<string, string> = {
          'INVALID_QR_FORMAT': 'Ongeldige QR code. Scan een ChargeTap QR.',
          'INVALID_SIGNATURE': 'Ongeldige QR code. Dit kan een namaak zijn.',
          'QR_EXPIRED': 'QR code verlopen. Scan opnieuw.',
          'UNKNOWN_CONNECTOR': 'Laadpunt niet gevonden.',
          'RATE_LIMIT_EXCEEDED': 'Te veel verzoeken. Probeer later opnieuw.',
        };
        
        setError(errorMessages[data.error] || data.message || 'Er ging iets mis');
        return;
      }
      
      await sendTelemetry('qr_scanned', { 
        success: true, 
        evse_uid: data.charger.evse_uid 
      });
      
      setResolvedData(data);
    } catch (err) {
      setError('Kan geen verbinding maken met server');
    } finally {
      setLoading(false);
    }
  };
  
  const handleBarCodeScanned = ({ data }: { data: string }) => {
    // Only process chargetap:// or https://chargetap.app URLs
    if (data.includes('chargetap://') || data.includes('chargetap.app')) {
      handleQRPayload(data);
    } else {
      // Not a ChargeTap QR
      if (!scanned) {
        setScanned(true);
        setError('Dit is geen ChargeTap QR code');
        setTimeout(() => {
          setScanned(false);
          setError(null);
        }, 2000);
      }
    }
  };
  
  const handleStartCharging = async () => {
    if (!resolvedData || !token) return;
    
    setLoading(true);
    
    try {
      await sendTelemetry('qr_start_initiated', { 
        evse_uid: resolvedData.charger.evse_uid 
      });
      
      const response = await fetch(`${getApiUrl()}/api/charging/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          charger_id: resolvedData.charger.id,
          connector_id: resolvedData.charger.connector_id,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        await sendTelemetry('qr_start_failed', { 
          evse_uid: resolvedData.charger.evse_uid,
          error: data.error 
        });
        
        Alert.alert('Fout', data.error || 'Kon laden niet starten');
        return;
      }
      
      await sendTelemetry('qr_start_success', { 
        evse_uid: resolvedData.charger.evse_uid,
        session_id: data.session_id 
      });
      
      // Navigate to live session
      router.replace({
        pathname: '/live-session',
        params: { sessionId: data.session_id },
      });
    } catch (err) {
      Alert.alert('Fout', 'Kan geen verbinding maken met server');
    } finally {
      setLoading(false);
    }
  };
  
  const resetScanner = () => {
    setScanned(false);
    setResolvedData(null);
    setError(null);
  };
  
  // Permission handling
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }
  
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Ionicons name="camera-outline" size={80} color="#666" />
        <Text style={styles.permissionTitle}>Camera toegang nodig</Text>
        <Text style={styles.permissionText}>
          Om QR codes te scannen heeft ChargeTap toegang tot je camera nodig.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Camera toestaan</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Terug</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  // Show resolved charger details
  if (resolvedData) {
    const isAvailable = resolvedData.charger.status === 'AVAILABLE';
    
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={resetScanner} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Laadpunt gevonden</Text>
          <View style={styles.headerButton} />
        </View>
        
        <View style={styles.chargerCard}>
          <View style={styles.stationHeader}>
            <Ionicons name="flash" size={32} color="#4CAF50" />
            <View style={styles.stationInfo}>
              <Text style={styles.stationName}>{resolvedData.station.name}</Text>
              <Text style={styles.stationAddress}>{resolvedData.station.address}</Text>
            </View>
          </View>
          
          <View style={styles.chargerDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Connector</Text>
              <Text style={styles.detailValue}>
                {resolvedData.charger.connector_type} • {resolvedData.charger.max_kw} kW
              </Text>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: isAvailable ? '#4CAF50' : '#FF9800' }
              ]}>
                <Text style={styles.statusText}>
                  {isAvailable ? 'Beschikbaar' : resolvedData.charger.status}
                </Text>
              </View>
            </View>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>EVSE ID</Text>
              <Text style={styles.detailValueSmall}>{resolvedData.charger.evse_uid}</Text>
            </View>
          </View>
          
          <View style={styles.pricingSection}>
            <Text style={styles.pricingSectionTitle}>Tarieven</Text>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Starttarief</Text>
              <Text style={styles.pricingValue}>
                €{(resolvedData.tariff.start_fee_cents / 100).toFixed(2)}
              </Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Energietarief</Text>
              <Text style={styles.pricingValue}>
                €{(resolvedData.tariff.energy_rate_cents_per_kwh / 100).toFixed(2)}/kWh
              </Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>BTW</Text>
              <Text style={styles.pricingValue}>{resolvedData.tariff.tax_percent}%</Text>
            </View>
            {resolvedData.tariff.penalty_enabled && (
              <View style={styles.penaltyWarning}>
                <Ionicons name="warning" size={16} color="#FF9800" />
                <Text style={styles.penaltyText}>
                  Idle fee na {resolvedData.tariff.penalty_grace_minutes} min: 
                  €{(resolvedData.tariff.penalty_cents_per_minute / 100).toFixed(2)}/min
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.estimateSection}>
            <Text style={styles.estimateTitle}>Geschat voor 20 kWh</Text>
            <Text style={styles.estimateValue}>{resolvedData.estimate.total_display}</Text>
            <Text style={styles.estimateTime}>
              ~{resolvedData.estimate.estimated_minutes} minuten laden
            </Text>
          </View>
        </View>
        
        {!token ? (
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginButtonText}>Inloggen om te laden</Text>
          </TouchableOpacity>
        ) : !isAvailable ? (
          <View style={styles.unavailableButton}>
            <Ionicons name="time" size={20} color="#999" />
            <Text style={styles.unavailableText}>Laadpunt niet beschikbaar</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.startButton, loading && styles.startButtonDisabled]}
            onPress={handleStartCharging}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="flash" size={24} color="#000" />
                <Text style={styles.startButtonText}>Start Laden</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }
  
  // Scanner view
  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={flashEnabled}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      
      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top section */}
        <View style={styles.overlaySection} />
        
        {/* Middle section with scan area */}
        <View style={styles.middleSection}>
          <View style={styles.overlaySection} />
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.overlaySection} />
        </View>
        
        {/* Bottom section */}
        <View style={styles.overlaySection}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>QR code verifiëren...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={48} color="#F44336" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={resetScanner}>
                <Text style={styles.retryButtonText}>Opnieuw scannen</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.instructionContainer}>
              <Text style={styles.instructionText}>Scan de QR code op de laadpaal</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* Header buttons */}
      <View style={styles.headerOverlay}>
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.flashButton} 
          onPress={() => setFlashEnabled(!flashEnabled)}
        >
          <Ionicons 
            name={flashEnabled ? 'flash' : 'flash-off'} 
            size={24} 
            color="#FFF" 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlaySection: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  middleSection: {
    flexDirection: 'row',
    height: SCAN_AREA_SIZE,
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#4CAF50',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  headerOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flashButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  instructionText: {
    fontSize: 16,
    color: '#FFF',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#FFF',
    marginTop: 16,
  },
  errorContainer: {
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#333',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 24,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  permissionButtonText: {
    fontSize: 18,
    color: '#000',
    fontWeight: '600',
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#4CAF50',
  },
  chargerCard: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  stationInfo: {
    marginLeft: 12,
    flex: 1,
  },
  stationName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  stationAddress: {
    fontSize: 14,
    color: '#999',
    marginTop: 2,
  },
  chargerDetails: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#999',
  },
  detailValue: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  detailValueSmall: {
    fontSize: 12,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
  pricingSection: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  pricingSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginBottom: 12,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pricingLabel: {
    fontSize: 14,
    color: '#CCC',
  },
  pricingValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
  },
  penaltyWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,152,0,0.1)',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  penaltyText: {
    fontSize: 12,
    color: '#FF9800',
    marginLeft: 8,
    flex: 1,
  },
  estimateSection: {
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  estimateTitle: {
    fontSize: 14,
    color: '#999',
  },
  estimateValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginVertical: 4,
  },
  estimateTime: {
    fontSize: 14,
    color: '#666',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 40,
    paddingVertical: 18,
    borderRadius: 12,
    gap: 8,
  },
  startButtonDisabled: {
    opacity: 0.6,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  loginButton: {
    backgroundColor: '#333',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 40,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  unavailableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 40,
    paddingVertical: 18,
    borderRadius: 12,
    gap: 8,
  },
  unavailableText: {
    fontSize: 16,
    color: '#999',
  },
});
