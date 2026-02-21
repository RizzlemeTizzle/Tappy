import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';

interface LoginWallProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actionType?: 'start_session' | 'view_history' | 'manage_payment' | 'view_profile' | 'generic';
  returnTo?: string;
  pendingData?: any;
}

const ACTION_MESSAGES: Record<string, { title: string; message: string; icon: keyof typeof Ionicons.glyphMap }> = {
  start_session: {
    title: 'Inloggen om te laden',
    message: 'Om een laadsessie te starten heb je een account nodig. Dit is vereist voor betalingsautorisatie en om je bonnetje te ontvangen.',
    icon: 'flash',
  },
  view_history: {
    title: 'Inloggen voor sessiegeschiedenis',
    message: 'Je laadgeschiedenis en bonnetjes zijn gekoppeld aan je account. Log in om ze te bekijken.',
    icon: 'time',
  },
  manage_payment: {
    title: 'Inloggen voor betalingen',
    message: 'Om een betaalmethode toe te voegen of te beheren heb je een account nodig.',
    icon: 'card',
  },
  view_profile: {
    title: 'Inloggen voor profiel',
    message: 'Je profielinstellingen zijn gekoppeld aan je account.',
    icon: 'person',
  },
  generic: {
    title: 'Inloggen vereist',
    message: 'Deze functie is alleen beschikbaar voor ingelogde gebruikers.',
    icon: 'lock-closed',
  },
};

export function LoginWall({
  visible,
  onClose,
  title,
  message,
  actionType = 'generic',
  returnTo,
  pendingData,
}: LoginWallProps) {
  const router = useRouter();
  const { setPendingAction } = useAuthStore();
  
  const actionInfo = ACTION_MESSAGES[actionType];
  const displayTitle = title || actionInfo.title;
  const displayMessage = message || actionInfo.message;

  const handleSignIn = () => {
    // Store pending action so we can resume after login
    if (returnTo || pendingData) {
      setPendingAction({
        type: actionType,
        data: pendingData,
        returnTo: returnTo,
      });
    }
    onClose();
    router.push('/login');
  };

  const handleCreateAccount = () => {
    if (returnTo || pendingData) {
      setPendingAction({
        type: actionType,
        data: pendingData,
        returnTo: returnTo,
      });
    }
    onClose();
    router.push('/register');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name={actionInfo.icon} size={48} color="#4CAF50" />
          </View>

          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.message}>{displayMessage}</Text>

          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <Ionicons name="shield-checkmark" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Veilige betalingen</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="receipt" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Digitale bonnetjes</Text>
            </View>
            <View style={styles.benefitItem}>
              <Ionicons name="time" size={20} color="#4CAF50" />
              <Text style={styles.benefitText}>Laadgeschiedenis</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleSignIn}>
            <Text style={styles.primaryButtonText}>Inloggen</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateAccount}>
            <Text style={styles.secondaryButtonText}>Account aanmaken</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={onClose}>
            <Text style={styles.linkButtonText}>Verder browsen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// Inline LoginWall for use in screens (not modal)
export function InlineLoginWall({
  title,
  message,
  actionType = 'generic',
  returnTo,
  pendingData,
  showBrowseLink = true,
}: Omit<LoginWallProps, 'visible' | 'onClose'> & { showBrowseLink?: boolean }) {
  const router = useRouter();
  const { setPendingAction } = useAuthStore();
  
  const actionInfo = ACTION_MESSAGES[actionType];
  const displayTitle = title || actionInfo.title;
  const displayMessage = message || actionInfo.message;

  const handleSignIn = () => {
    if (returnTo || pendingData) {
      setPendingAction({
        type: actionType,
        data: pendingData,
        returnTo: returnTo,
      });
    }
    router.push('/login');
  };

  const handleCreateAccount = () => {
    if (returnTo || pendingData) {
      setPendingAction({
        type: actionType,
        data: pendingData,
        returnTo: returnTo,
      });
    }
    router.push('/register');
  };

  return (
    <View style={styles.inlineContainer}>
      <View style={styles.iconContainer}>
        <Ionicons name={actionInfo.icon} size={48} color="#4CAF50" />
      </View>

      <Text style={styles.title}>{displayTitle}</Text>
      <Text style={styles.message}>{displayMessage}</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSignIn}>
        <Text style={styles.primaryButtonText}>Inloggen</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleCreateAccount}>
        <Text style={styles.secondaryButtonText}>Account aanmaken</Text>
      </TouchableOpacity>

      {showBrowseLink && (
        <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
          <Text style={styles.linkButtonText}>Terug</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Button replacement for guest mode
export function GuestBlockedButton({
  label,
  onPress,
  actionType = 'generic',
  style,
}: {
  label: string;
  onPress: () => void;
  actionType?: LoginWallProps['actionType'];
  style?: any;
}) {
  const { isGuest } = useAuthStore();
  const [showWall, setShowWall] = React.useState(false);

  const handlePress = () => {
    if (isGuest) {
      setShowWall(true);
    } else {
      onPress();
    }
  };

  return (
    <>
      <TouchableOpacity style={[styles.guestButton, style]} onPress={handlePress}>
        <Text style={styles.guestButtonText}>
          {isGuest ? 'Inloggen om te starten' : label}
        </Text>
        {isGuest && <Ionicons name="lock-closed" size={16} color="#0A0A0A" style={{ marginLeft: 8 }} />}
      </TouchableOpacity>
      <LoginWall
        visible={showWall}
        onClose={() => setShowWall(false)}
        actionType={actionType}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: 'center',
  },
  inlineContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  benefitsList: {
    width: '100%',
    marginBottom: 32,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    marginBottom: 8,
  },
  benefitText: {
    color: '#FFFFFF',
    fontSize: 15,
    marginLeft: 12,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#0A0A0A',
    fontSize: 17,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  linkButton: {
    paddingVertical: 12,
  },
  linkButtonText: {
    color: '#888',
    fontSize: 15,
  },
  guestButton: {
    flexDirection: 'row',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    color: '#0A0A0A',
    fontSize: 17,
    fontWeight: '600',
  },
});
