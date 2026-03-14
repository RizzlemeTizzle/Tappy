import { Alert, Platform } from 'react-native';

type AlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

/**
 * Cross-platform alert wrapper.
 * On native: delegates to Alert.alert (with all button options).
 * On web: uses window.alert for informational dialogs,
 *         window.confirm for cancel+action dialogs.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const body = [title, message].filter(Boolean).join('\n\n');

  if (!buttons || buttons.length <= 1) {
    (window as any).alert(body);
    buttons?.[0]?.onPress?.();
    return;
  }

  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const actionButton = buttons.find((b) => b.style !== 'cancel');

  if (cancelButton && actionButton) {
    const confirmed = (window as any).confirm(body);
    if (confirmed) {
      actionButton.onPress?.();
    } else {
      cancelButton.onPress?.();
    }
  } else {
    // Multiple non-cancel buttons — just alert and invoke the first
    (window as any).alert(body);
    buttons[0]?.onPress?.();
  }
}
