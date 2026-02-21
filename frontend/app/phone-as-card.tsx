import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNfcStore } from '../src/store/nfcStore';
import { useAuthStore } from '../src/store/authStore';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../src/i18n';

type SetupStep = 'intro' | 'payment' | 'provision' | 'activate' | 'complete';

export default function PhoneAsCardScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const {
    tokens,
    activeToken,
    isLoading,
    error,
    fetchTokenStatus,
    provisionToken,
    activateToken,
    deactivateToken,
    clearError
  } = useNfcStore();

  const [setupStep, setSetupStep] = useState<SetupStep>('intro');
  const [hceEnabled, setHceEnabled] = useState(false);

  useEffect(() => {
    fetchTokenStatus();
  }, []);

  useEffect(() => {
    if (activeToken) {
      setHceEnabled(true);
      setSetupStep('complete');
    }
  }, [activeToken]);

  useEffect(() => {
    if (error) {
      Alert.alert(t('common.error'), error, [{ text: t('common.ok'), onPress: clearError }]);
    }
  }, [error]);

  const handleStartSetup = () => {
    if (!user?.payment_method_added) {
      setSetupStep('payment');
    } else {
      setSetupStep('provision');
    }
  };

  const handleProvision = async () => {
    try {
      await provisionToken();
      setSetupStep('activate');
    } catch (err) {
      // Error handled by store
    }
  };

  const handleActivate = async () => {
    const token = tokens[0];
    if (token) {
      await activateToken(token.id);
      setSetupStep('complete');
    }
  };

  const handleToggleHce = async (enabled: boolean) => {
    if (enabled) {
      const token = tokens[0];
      if (token) {
        await activateToken(token.id);
        setHceEnabled(true);
      }
    } else {
      const token = tokens.find(t => t.is_active);
      if (token) {
        await deactivateToken(token.id);
        setHceEnabled(false);
      }
    }
  };

  const renderIntroStep = () => (
    <View style={styles.introContainer}>
      <ScrollView 
        style={styles.scrollContainer} 
        contentContainerStyle={styles.introScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconContainerSmall}>
          <Ionicons name="phone-portrait" size={64} color="#4CAF50" />
          <View style={styles.nfcBadgeSmall}>
            <Ionicons name="wifi" size={20} color="#FFF" />
          </View>
        </View>
        
        <Text style={styles.stepTitle}>{t('nfc.title')}</Text>
        <Text style={styles.stepDescriptionCompact}>
          {t('nfc.description')}
        </Text>

        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <Ionicons name="flash" size={18} color="#4CAF50" />
            <Text style={styles.featureText}>{t('nfc.feature1')}</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={18} color="#4CAF50" />
            <Text style={styles.featureText}>{t('nfc.feature2')}</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="card" size={18} color="#4CAF50" />
            <Text style={styles.featureText}>{t('nfc.feature3')}</Text>
          </View>
        </View>

        {Platform.OS !== 'android' && (
          <View style={styles.warningBoxCompact}>
            <Ionicons name="warning" size={18} color="#FFC107" />
            <Text style={styles.warningTextCompact}>
              {t('nfc.androidOnly')}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.fixedButtonContainer}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleStartSetup}
          disabled={Platform.OS !== 'android'}
          data-testid="start-setup-btn"
        >
          <Text style={styles.primaryButtonText}>{t('nfc.startSetup')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPaymentStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="card" size={80} color="#FFC107" />
      </View>
      
      <Text style={styles.stepTitle}>{t('payment.cardRequired')}</Text>
      <Text style={styles.stepDescription}>
        {t('payment.cardRequired')}
      </Text>

      <TouchableOpacity 
        style={styles.primaryButton}
        onPress={() => router.push('/add-payment')}
      >
        <Text style={styles.primaryButtonText}>{t('profile.addPaymentMethod')}</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => setSetupStep('intro')}
      >
        <Text style={styles.secondaryButtonText}>{t('common.back')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderProvisionStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name="key" size={80} color="#2196F3" />
      </View>
      
      <Text style={styles.stepTitle}>{t('nfc.createToken')}</Text>
      <Text style={styles.stepDescription}>
        {t('nfc.createTokenDesc')}
      </Text>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#4CAF50" />
        <Text style={styles.infoText}>
          {t('nfc.feature2')}
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.primaryButton}
        onPress={handleProvision}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('nfc.createToken')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.secondaryButton}
        onPress={() => setSetupStep('intro')}
      >
        <Text style={styles.secondaryButtonText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderActivateStep = () => {
    const token = tokens[0];
    
    return (
      <View style={styles.stepContainer}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
        </View>
        
        <Text style={styles.stepTitle}>{t('nfc.tokenCreated')}</Text>
        <Text style={styles.stepDescription}>
          {t('nfc.activateHce')}
        </Text>

        {token && (
          <View style={styles.tokenCard}>
            <View style={styles.tokenHeader}>
              <Text style={styles.tokenLabel}>{t('nfc.contractId')}</Text>
              <Text style={styles.tokenValue}>{token.contract_id}</Text>
            </View>
            <View style={styles.tokenHeader}>
              <Text style={styles.tokenLabel}>{t('nfc.tokenUid')}</Text>
              <Text style={styles.tokenValue}>{token.visual_number}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={handleActivate}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('nfc.activateHce')}</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderCompleteStep = () => {
    const token = tokens.find(t => t.is_active) || tokens[0];
    
    return (
      <ScrollView style={styles.scrollContainer}>
        <View style={styles.completeContainer}>
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusIndicator, hceEnabled && styles.statusActive]} />
              <Text style={styles.statusTitle}>
                {hceEnabled ? t('nfc.hceActive') : t('nfc.hceInactive')}
              </Text>
            </View>
            
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>{t('nfc.enablePhoneAsCard')}</Text>
              <Switch
                value={hceEnabled}
                onValueChange={handleToggleHce}
                trackColor={{ false: '#3A3A3A', true: '#4CAF50' }}
                thumbColor={hceEnabled ? '#FFF' : '#888'}
                disabled={isLoading}
              />
            </View>
          </View>

          {token && (
            <View style={styles.tokenDetailCard}>
              <Text style={styles.cardSectionTitle}>{t('nfc.title')}</Text>
              
              <View style={styles.detailRow}>
                <Ionicons name="document-text" size={20} color="#888" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>{t('nfc.contractId')}</Text>
                  <Text style={styles.detailValue}>{token.contract_id}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Ionicons name="key" size={20} color="#888" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>{t('nfc.tokenUid')}</Text>
                  <Text style={styles.detailValue}>{token.visual_number}</Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Ionicons name="flash" size={20} color="#888" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>{t('nfc.tapCount')}</Text>
                  <Text style={styles.detailValue}>{token.tap_count}</Text>
                </View>
              </View>

              {token.last_tap_at && (
                <View style={styles.detailRow}>
                  <Ionicons name="time" size={20} color="#888" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>{t('nfc.lastTap')}</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(token.last_tap_at)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <View style={styles.instructionsCard}>
            <Text style={styles.cardSectionTitle}>{t('nfc.howToUse')}</Text>
            
            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>1</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('nfc.step1')}
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>2</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('nfc.step2')}
              </Text>
            </View>

            <View style={styles.instructionItem}>
              <View style={styles.instructionNumber}>
                <Text style={styles.instructionNumberText}>3</Text>
              </View>
              <Text style={styles.instructionText}>
                {t('nfc.step3')}
              </Text>
            </View>
          </View>

          <View style={styles.noteBox}>
            <Ionicons name="information-circle" size={20} color="#2196F3" />
            <Text style={styles.noteText}>
              {t('nfc.screenOffNote')}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  };

  const renderCurrentStep = () => {
    switch (setupStep) {
      case 'intro':
        return renderIntroStep();
      case 'payment':
        return renderPaymentStep();
      case 'provision':
        return renderProvisionStep();
      case 'activate':
        return renderActivateStep();
      case 'complete':
        return renderCompleteStep();
      default:
        return renderIntroStep();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('nfc.title')}</Text>
        <View style={styles.placeholder} />
      </View>
      
      {isLoading && setupStep === 'intro' ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : (
        renderCurrentStep()
      )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  introContainer: {
    flex: 1,
  },
  introScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    alignItems: 'center',
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    alignItems: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  stepContentContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  fixedButtonContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  completeContainer: {
    padding: 20,
  },
  iconContainerSmall: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  nfcBadgeSmall: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  nfcBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  stepDescriptionCompact: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  featureList: {
    width: '100%',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  featureText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginLeft: 10,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  warningBoxCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  warningText: {
    color: '#FFC107',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  warningTextCompact: {
    color: '#FFC107',
    fontSize: 12,
    marginLeft: 10,
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  infoText: {
    color: '#4CAF50',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#888',
    fontSize: 16,
  },
  tokenCard: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  tokenHeader: {
    marginBottom: 12,
  },
  tokenLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 4,
  },
  tokenValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#666',
    marginRight: 10,
  },
  statusActive: {
    backgroundColor: '#4CAF50',
  },
  statusTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  tokenDetailCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardSectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    color: '#666',
    fontSize: 12,
    marginBottom: 2,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  instructionsCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  instructionNumberText: {
    color: '#0A0A0A',
    fontSize: 14,
    fontWeight: '700',
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 15,
    flex: 1,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  noteText: {
    color: '#2196F3',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
});
