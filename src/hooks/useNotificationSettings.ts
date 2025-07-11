import { usePreferencesContext } from '../contexts/PreferencesContext';
import { useCallback, useMemo } from 'react';
import * as Notifications from 'expo-notifications';

export const useNotificationSettings = () => {
  const { preferences, updateNotificationSettings, updatePushToken } = usePreferencesContext();

  const notificationsEnabled = useMemo(() => {
    return preferences?.notificationsEnabled ?? true;
  }, [preferences?.notificationsEnabled]);

  const notificationTime = useMemo(() => {
    return preferences?.notificationTime || '09:00';
  }, [preferences?.notificationTime]);

  const pushToken = useMemo(() => {
    return preferences?.pushToken || null;
  }, [preferences?.pushToken]);

  const setNotificationsEnabled = useCallback(async (enabled: boolean) => {
    try {
      if (enabled) {
        // Request permissions if enabling
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Notification permissions not granted');
        }

        // Get and save push token
        const token = await Notifications.getExpoPushTokenAsync();
        await updatePushToken(token.data);
      } else {
        // Clear push token if disabling
        await updatePushToken(null);
      }

      await updateNotificationSettings({ enabled });
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      throw error;
    }
  }, [updateNotificationSettings, updatePushToken]);

  const setNotificationTime = useCallback(async (time: string) => {
    try {
      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(time)) {
        throw new Error('Invalid time format. Use HH:MM');
      }

      await updateNotificationSettings({ time });

      // Reschedule notifications with new time
      if (notificationsEnabled) {
        await scheduleNotifications(time);
      }
    } catch (error) {
      console.error('Failed to update notification time:', error);
      throw error;
    }
  }, [updateNotificationSettings, notificationsEnabled]);

  const scheduleNotifications = useCallback(async (time: string) => {
    try {
      // Cancel all existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

      if (!notificationsEnabled) return;

      // Parse time
      const [hours, minutes] = time.split(':').map(Number);

      // Schedule daily notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Daily Joke Time!',
          body: 'Ready for your daily dose of laughter?',
          data: { type: 'daily_joke' },
        },
        trigger: {
          hour: hours,
          minute: minutes,
          repeats: true,
        },
      });
    } catch (error) {
      console.error('Failed to schedule notifications:', error);
      throw error;
    }
  }, [notificationsEnabled]);

  const requestPermissions = useCallback(async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        throw new Error('Notification permissions denied');
      }

      // Get push token
      const token = await Notifications.getExpoPushTokenAsync();
      await updatePushToken(token.data);

      return true;
    } catch (error) {
      console.error('Failed to request permissions:', error);
      return false;
    }
  }, [updatePushToken]);

  const checkPermissions = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  }, []);

  return {
    notificationsEnabled,
    notificationTime,
    pushToken,
    setNotificationsEnabled,
    setNotificationTime,
    scheduleNotifications,
    requestPermissions,
    checkPermissions,
  };
};