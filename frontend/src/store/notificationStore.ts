import { create } from 'zustand';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import api from '../utils/api';
import i18n from '../i18n';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Notification Types (must match backend)
export const NotificationType = {
  SESSION_STARTED: 'SESSION_STARTED',
  SESSION_START_FAILED: 'SESSION_START_FAILED',
  SESSION_STOPPED: 'SESSION_STOPPED',
  SESSION_INTERRUPTED: 'SESSION_INTERRUPTED',
  CHARGING_COMPLETE: 'CHARGING_COMPLETE',
  PENALTY_STARTS_SOON: 'PENALTY_STARTS_SOON',
  PENALTY_STARTED: 'PENALTY_STARTED',
  PENALTY_CAP_REACHED: 'PENALTY_CAP_REACHED',
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  COST_MILESTONE: 'COST_MILESTONE',
} as const;

export interface NotificationPreferences {
  session_updates_enabled: boolean;
  penalty_alerts_enabled: boolean;
  payment_enabled: boolean;
  cost_milestones_enabled: boolean;
  penalty_prealert_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface NotificationState {
  // State
  hasPermission: boolean;
  expoPushToken: string | null;
  deviceId: string | null;
  preferences: NotificationPreferences;
  isLoading: boolean;
  error: string | null;
  scheduledNotifications: string[];
  
  // Actions
  requestPermissions: () => Promise<boolean>;
  registerDevice: () => Promise<void>;
  deregisterDevice: () => Promise<void>;
  loadPreferences: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  scheduleLocalNotification: (type: string, params: Record<string, string>, delaySeconds: number) => Promise<string | null>;
  cancelLocalNotification: (id: string) => Promise<void>;
  cancelAllScheduledNotifications: () => Promise<void>;
  handleNotificationResponse: (response: Notifications.NotificationResponse) => void;
}

// Get localized notification content
export const getLocalizedNotification = (type: string, params: Record<string, string>): { title: string; body: string } => {
  const locale = i18n.language;
  
  const templates: Record<string, { title: string; body: string }> = {
    [NotificationType.SESSION_STARTED]: {
      title: i18n.t('notifications.sessionStarted.title', 'Charging Started'),
      body: i18n.t('notifications.sessionStarted.body', 'Your charging session at {{station_name}} has begun.', params),
    },
    [NotificationType.SESSION_START_FAILED]: {
      title: i18n.t('notifications.sessionStartFailed.title', 'Charging Failed'),
      body: i18n.t('notifications.sessionStartFailed.body', 'Could not start charging at {{station_name}}.', params),
    },
    [NotificationType.CHARGING_COMPLETE]: {
      title: i18n.t('notifications.chargingComplete.title', 'Charging Complete'),
      body: i18n.t('notifications.chargingComplete.body', 'Your vehicle is fully charged! Total: {{total}}. ({{energy}} kWh)', params),
    },
    [NotificationType.PENALTY_STARTS_SOON]: {
      title: i18n.t('notifications.penaltyStartsSoon.title', 'Idle Fee Warning'),
      body: i18n.t('notifications.penaltyStartsSoon.body', 'Idle fee starts in {{minutes}} min at {{station_name}}. Rate: {{rate}}/min.', params),
    },
    [NotificationType.PENALTY_STARTED]: {
      title: i18n.t('notifications.penaltyStarted.title', 'Idle Fee Active'),
      body: i18n.t('notifications.penaltyStarted.body', 'Idle fee is now active at {{station_name}}. {{rate}}/min. Please move your vehicle.', params),
    },
    [NotificationType.PENALTY_CAP_REACHED]: {
      title: i18n.t('notifications.penaltyCapReached.title', 'Idle Fee Capped'),
      body: i18n.t('notifications.penaltyCapReached.body', 'Maximum idle fee of {{max_fee}} reached at {{station_name}}.', params),
    },
    [NotificationType.SESSION_STOPPED]: {
      title: i18n.t('notifications.sessionStopped.title', 'Session Ended'),
      body: i18n.t('notifications.sessionStopped.body', 'Your session at {{station_name}} has ended. Total: {{total}}.', params),
    },
    [NotificationType.SESSION_INTERRUPTED]: {
      title: i18n.t('notifications.sessionInterrupted.title', 'Session Interrupted'),
      body: i18n.t('notifications.sessionInterrupted.body', 'Your session at {{station_name}} was interrupted. Reason: {{reason}}.', params),
    },
    [NotificationType.PAYMENT_SUCCEEDED]: {
      title: i18n.t('notifications.paymentSucceeded.title', 'Payment Successful'),
      body: i18n.t('notifications.paymentSucceeded.body', 'Payment of {{total}} completed. Receipt available in app.', params),
    },
    [NotificationType.PAYMENT_FAILED]: {
      title: i18n.t('notifications.paymentFailed.title', 'Payment Failed'),
      body: i18n.t('notifications.paymentFailed.body', 'Payment of {{total}} failed. Please update your payment method.', params),
    },
    [NotificationType.COST_MILESTONE]: {
      title: i18n.t('notifications.costMilestone.title', 'Cost Update'),
      body: i18n.t('notifications.costMilestone.body', 'Your session has reached {{total}}. Currently at {{energy}} kWh.', params),
    },
  };
  
  return templates[type] || { title: 'Notification', body: '' };
};

// Get unique device ID
const getDeviceId = async (): Promise<string> => {
  // Use a combination of device info for a unique ID
  const deviceName = Device.deviceName || 'unknown';
  const modelId = Device.modelId || 'unknown';
  const osVersion = Device.osVersion || '0';
  
  // Create a simple hash
  const combined = `${deviceName}-${modelId}-${osVersion}-${Platform.OS}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(16);
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  hasPermission: false,
  expoPushToken: null,
  deviceId: null,
  preferences: {
    session_updates_enabled: true,
    penalty_alerts_enabled: true,
    payment_enabled: true,
    cost_milestones_enabled: false,
    penalty_prealert_minutes: 5,
    quiet_hours_start: null,
    quiet_hours_end: null,
  },
  isLoading: false,
  error: null,
  scheduledNotifications: [],
  
  requestPermissions: async () => {
    try {
      // Check if it's a physical device
      if (!Device.isDevice) {
        console.log('[Notifications] Not a physical device, permissions not required');
        set({ hasPermission: true });
        return true;
      }
      
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      const hasPermission = finalStatus === 'granted';
      set({ hasPermission });
      
      if (hasPermission && Platform.OS === 'android') {
        // Set notification channel for Android
        await Notifications.setNotificationChannelAsync('charging', {
          name: 'Charging Updates',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4CAF50',
        });
        
        await Notifications.setNotificationChannelAsync('penalty', {
          name: 'Idle Fee Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 250, 500],
          lightColor: '#FF9800',
        });
        
        await Notifications.setNotificationChannelAsync('payment', {
          name: 'Payment Updates',
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: '#2196F3',
        });
      }
      
      return hasPermission;
    } catch (error) {
      console.error('[Notifications] Permission request failed:', error);
      set({ error: 'Failed to request notification permissions' });
      return false;
    }
  },
  
  registerDevice: async () => {
    try {
      set({ isLoading: true, error: null });
      
      const deviceId = await getDeviceId();
      set({ deviceId });
      
      // Get push token if on physical device
      let pushToken = null;
      if (Device.isDevice) {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId,
          });
          pushToken = tokenData.data;
        } catch (e) {
          console.log('[Notifications] Could not get push token:', e);
        }
      }
      
      set({ expoPushToken: pushToken });
      
      // Register with backend
      await api.post('/devices/register', {
        device_id: deviceId,
        platform: Platform.OS,
        fcm_token: pushToken, // In production, this would be FCM token
        app_version: Constants.expoConfig?.version || '1.0.0',
        locale: i18n.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      
      console.log('[Notifications] Device registered:', deviceId);
      set({ isLoading: false });
    } catch (error: any) {
      console.error('[Notifications] Device registration failed:', error);
      set({ 
        isLoading: false, 
        error: error.response?.data?.detail || 'Failed to register device' 
      });
    }
  },
  
  deregisterDevice: async () => {
    try {
      const { deviceId } = get();
      if (!deviceId) return;
      
      await api.post('/devices/deregister', { device_id: deviceId });
      
      // Cancel all scheduled notifications
      await get().cancelAllScheduledNotifications();
      
      set({ 
        deviceId: null, 
        expoPushToken: null,
        scheduledNotifications: [] 
      });
      
      console.log('[Notifications] Device deregistered');
    } catch (error) {
      console.error('[Notifications] Device deregistration failed:', error);
    }
  },
  
  loadPreferences: async () => {
    try {
      set({ isLoading: true });
      const response = await api.get('/me/notification-preferences');
      set({ 
        preferences: response.data,
        isLoading: false 
      });
    } catch (error: any) {
      console.error('[Notifications] Failed to load preferences:', error);
      set({ isLoading: false });
    }
  },
  
  updatePreferences: async (prefs) => {
    try {
      set({ isLoading: true });
      await api.put('/me/notification-preferences', prefs);
      
      set((state) => ({
        preferences: { ...state.preferences, ...prefs },
        isLoading: false,
      }));
      
      console.log('[Notifications] Preferences updated');
    } catch (error: any) {
      console.error('[Notifications] Failed to update preferences:', error);
      set({ 
        isLoading: false,
        error: error.response?.data?.detail || 'Failed to update preferences'
      });
      throw error;
    }
  },
  
  scheduleLocalNotification: async (type, params, delaySeconds) => {
    try {
      const { preferences, hasPermission } = get();
      
      if (!hasPermission) {
        console.log('[Notifications] No permission to send notifications');
        return null;
      }
      
      // Check if this type is enabled
      const typeToPreferenceMap: Record<string, keyof NotificationPreferences> = {
        [NotificationType.SESSION_STARTED]: 'session_updates_enabled',
        [NotificationType.SESSION_START_FAILED]: 'session_updates_enabled',
        [NotificationType.SESSION_STOPPED]: 'session_updates_enabled',
        [NotificationType.SESSION_INTERRUPTED]: 'session_updates_enabled',
        [NotificationType.CHARGING_COMPLETE]: 'session_updates_enabled',
        [NotificationType.PENALTY_STARTS_SOON]: 'penalty_alerts_enabled',
        [NotificationType.PENALTY_STARTED]: 'penalty_alerts_enabled',
        [NotificationType.PENALTY_CAP_REACHED]: 'penalty_alerts_enabled',
        [NotificationType.PAYMENT_SUCCEEDED]: 'payment_enabled',
        [NotificationType.PAYMENT_FAILED]: 'payment_enabled',
        [NotificationType.COST_MILESTONE]: 'cost_milestones_enabled',
      };
      
      const prefKey = typeToPreferenceMap[type];
      if (prefKey && !preferences[prefKey]) {
        console.log(`[Notifications] Type ${type} disabled by user`);
        return null;
      }
      
      // Get localized content
      const content = getLocalizedNotification(type, params);
      
      // Determine channel based on type
      let channelId = 'charging';
      if (type.includes('PENALTY')) {
        channelId = 'penalty';
      } else if (type.includes('PAYMENT')) {
        channelId = 'payment';
      }
      
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: content.title,
          body: content.body,
          data: { type, ...params },
          sound: true,
          ...(Platform.OS === 'android' && { channelId }),
        },
        trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null,
      });
      
      set((state) => ({
        scheduledNotifications: [...state.scheduledNotifications, id],
      }));
      
      console.log(`[Notifications] Scheduled ${type} in ${delaySeconds}s, id: ${id}`);
      return id;
    } catch (error) {
      console.error('[Notifications] Failed to schedule notification:', error);
      return null;
    }
  },
  
  cancelLocalNotification: async (id) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
      set((state) => ({
        scheduledNotifications: state.scheduledNotifications.filter((n) => n !== id),
      }));
      console.log(`[Notifications] Cancelled notification ${id}`);
    } catch (error) {
      console.error('[Notifications] Failed to cancel notification:', error);
    }
  },
  
  cancelAllScheduledNotifications: async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      set({ scheduledNotifications: [] });
      console.log('[Notifications] Cancelled all scheduled notifications');
    } catch (error) {
      console.error('[Notifications] Failed to cancel all notifications:', error);
    }
  },
  
  handleNotificationResponse: (response) => {
    const data = response.notification.request.content.data;
    console.log('[Notifications] Response received:', data);
    
    // Navigation will be handled in the component that sets up the listener
    // This function is called to process the data
  },
}));

// Initialize notification listeners
export const initializeNotificationListeners = (
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) => {
  // Notification received while app is foregrounded
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Notifications] Received:', notification.request.content);
    onNotificationReceived?.(notification);
  });
  
  // User tapped on notification
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('[Notifications] Tapped:', response.notification.request.content);
    useNotificationStore.getState().handleNotificationResponse(response);
    onNotificationResponse?.(response);
  });
  
  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
};
