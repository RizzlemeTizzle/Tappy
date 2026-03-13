import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../src/store/authStore';
import { useTranslation } from 'react-i18next';

export default function AddPayment() {
  const router = useRouter();
  const { addPaymentMethod, user } = useAuthStore();
  const { t } = useTranslation();
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 16);
    const groups = cleaned.match(/.{1,4}/g) || [];
    return groups.join(' ');
  };

  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length >= 2) {
      return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    }
    return cleaned;
  };

  const handleSubmit = async () => {
    const cleanedCard = cardNumber.replace(/\s/g, '');
    if (cleanedCard.length !== 16) {
      Alert.alert(t('common.error'), t('errors.invalidCard'));
      return;
    }
    if (expiry.length !== 5) {
      Alert.alert(t('common.error'), t('errors.invalidCard'));
      return;
    }
    if (cvv.length < 3) {
      Alert.alert(t('common.error'), t('errors.invalidCard'));
      return;
    }

    setIsLoading(true);
    try {
      await addPaymentMethod(cleanedCard, expiry, cvv);
      Alert.alert(t('common.success'), t('payment.cardAdded'), [
        { text: t('common.ok'), onPress: () => router.replace('/(tabs)/profile') }
      ]);
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || error.message || t('errors.paymentFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="card" size={48} color="#4CAF50" />
            </View>
            <Text style={styles.title}>{t('payment.addCard')}</Text>
            <Text style={styles.subtitle}>{t('payment.chargeAfterSession')}</Text>
          </View>

          <View style={styles.mockNotice}>
            <Ionicons name="information-circle" size={20} color="#FFC107" />
            <Text style={styles.mockText}>
              {t('payment.demoMode')}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>{t('payment.cardNumber')}</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="card-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor="#666"
                value={cardNumber}
                onChangeText={(text) => setCardNumber(formatCardNumber(text))}
                keyboardType="number-pad"
                maxLength={19}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.halfColumn}>
                <Text style={styles.label}>{t('payment.expiryDate')}</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="MM/YY"
                    placeholderTextColor="#666"
                    value={expiry}
                    onChangeText={(text) => setExpiry(formatExpiry(text))}
                    keyboardType="number-pad"
                    maxLength={5}
                  />
                </View>
              </View>

              <View style={styles.halfColumn}>
                <Text style={styles.label}>{t('payment.cvv')}</Text>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="123"
                    placeholderTextColor="#666"
                    value={cvv}
                    onChangeText={(text) => setCvv(text.replace(/\D/g, '').slice(0, 4))}
                    keyboardType="number-pad"
                    maxLength={4}
                    secureTextEntry
                  />
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={20} color="#000" />
                  <Text style={styles.buttonText}>{t('payment.addCard')}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.securityNote}>
              <Ionicons name="lock-closed" size={16} color="#666" />
              <Text style={styles.securityText}>
                {t('payment.securePayment')}
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  mockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 24,
  },
  mockText: {
    color: '#FFC107',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  form: {
    gap: 16,
  },
  label: {
    color: '#B0B0B0',
    fontSize: 14,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  halfColumn: {
    flex: 1,
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '600',
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  securityText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    flex: 1,
  },
});
