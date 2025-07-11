import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SettingsScreen from '../screens/SettingsScreen';
import { NotificationService } from '../services/NotificationService';
import BackgroundJobService from '../services/BackgroundJobService';
import NavigationService from '../services/NavigationService';

// Mock dependencies
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: { [key: string]: string } = {
        'settings.title': 'Settings',
        'settings.notifications': 'Notifications',
        'settings.dailyJoke': 'Daily Joke Reminder',
        'settings.notificationPermissionTitle': 'Notification Permissions',
        'settings.notificationPermissionMessage': 'Please enable notifications in settings',
        'settings.cancel': 'Cancel',
        'settings.openSettings': 'Open Settings',
        'errors.general': 'Something went wrong',
        'notifications.testTitle': 'Test Notification',
        'notifications.testBody': 'Test notification body',
      };
      return translations[key] || key;
    },
  }),
}));

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Alert: {
      alert: jest.fn(),
    },
    Linking: {
      openSettings: jest.fn(),
    },
    Platform: {
      OS: 'ios',
      select: jest.fn((options) => options.ios),
    },
  };
});

jest.mock('../services/database/JokeService');

// Mock NavigationService
jest.mock('../services/NavigationService', () => ({
  getInstance: jest.fn(() => ({
    navigate: jest.fn(),
    reset: jest.fn(),
    handleNotificationNavigation: jest.fn(),
    navigateToJoke: jest.fn(),
  })),
}));

describe('Notification Integration Tests', () => {
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockBackgroundJobService: jest.Mocked<BackgroundJobService>;
  let mockNavigationService: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock services
    mockNotificationService = {
      initialize: jest.fn(),
      getSettings: jest.fn(),
      enableNotifications: jest.fn(),
      disableNotifications: jest.fn(),
      updateSettings: jest.fn(),
      testNotification: jest.fn(),
      requestPermissions: jest.fn(),
    } as any;

    mockBackgroundJobService = {
      initialize: jest.fn(),
      getJobStatus: jest.fn(),
      getCacheStatistics: jest.fn(),
    } as any;

    mockNavigationService = {
      navigate: jest.fn(),
      reset: jest.fn(),
      handleNotificationNavigation: jest.fn(),
      navigateToJoke: jest.fn(),
    };

    // Set up static mocks
    (NotificationService.getInstance as jest.Mock) = jest.fn(() => mockNotificationService);
    (BackgroundJobService.getInstance as jest.Mock) = jest.fn(() => mockBackgroundJobService);
    (NavigationService.getInstance as jest.Mock) = jest.fn(() => mockNavigationService);

    // Default mock implementations
    mockNotificationService.initialize.mockResolvedValue(undefined);
    mockNotificationService.getSettings.mockResolvedValue({
      enabled: false,
      time: '09:00',
    });
    
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
      ['@GiggleGlide:darkMode', null],
    ]);
  });

  describe('Settings Screen Notification Flow', () => {
    it('should enable notifications successfully', async () => {
      mockNotificationService.enableNotifications.mockResolvedValue(true);
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:00',
      });

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      // Find and toggle the notification switch
      const notificationSwitch = getByTestId('notification-switch');
      
      act(() => {
        fireEvent(notificationSwitch, 'valueChange', true);
      });

      await waitFor(() => {
        expect(mockNotificationService.enableNotifications).toHaveBeenCalledWith('09:00');
      });
    });

    it('should handle permission denial gracefully', async () => {
      mockNotificationService.enableNotifications.mockResolvedValue(false);
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      const notificationSwitch = getByTestId('notification-switch');
      
      act(() => {
        fireEvent(notificationSwitch, 'valueChange', true);
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Notification Permissions',
          'Please enable notifications in settings',
          expect.any(Array)
        );
      });
    });

    it('should disable notifications', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:00',
      });
      mockNotificationService.disableNotifications.mockResolvedValue(undefined);

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      const notificationSwitch = getByTestId('notification-switch');
      
      act(() => {
        fireEvent(notificationSwitch, 'valueChange', false);
      });

      await waitFor(() => {
        expect(mockNotificationService.disableNotifications).toHaveBeenCalled();
      });
    });

    it('should update notification time', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:00',
      });
      mockNotificationService.updateSettings.mockResolvedValue(undefined);

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      // Open time picker
      const timeButton = getByTestId('time-picker-button');
      
      act(() => {
        fireEvent.press(timeButton);
      });

      // Select new time
      const timePicker = getByTestId('time-picker');
      
      act(() => {
        fireEvent(timePicker, 'valueChange', '10:30');
      });

      await waitFor(() => {
        expect(mockNotificationService.updateSettings).toHaveBeenCalledWith({ time: '10:30' });
      });
    });

    it('should send test notification', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:00',
      });
      mockNotificationService.testNotification.mockResolvedValue(true);
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      const testButton = getByTestId('test-notification-button');
      
      act(() => {
        fireEvent.press(testButton);
      });

      await waitFor(() => {
        expect(mockNotificationService.testNotification).toHaveBeenCalled();
        expect(alertSpy).toHaveBeenCalledWith(
          'Test Notification Sent',
          'Check your notifications to see if it worked!'
        );
      });
    });

    it('should handle test notification failure', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:00',
      });
      mockNotificationService.testNotification.mockResolvedValue(false);
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      const testButton = getByTestId('test-notification-button');
      
      act(() => {
        fireEvent.press(testButton);
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Test Failed',
          'Unable to send test notification. Please check permissions.'
        );
      });
    });
  });

  describe('Notification Service Integration', () => {
    let realNotificationService: NotificationService;

    beforeEach(async () => {
      // Use real NotificationService for these tests
      realNotificationService = new (require('../services/NotificationService').NotificationService)();
      
      // Mock the underlying dependencies
      (realNotificationService as any).jokeService = {
        initialize: jest.fn().mockResolvedValue(undefined),
        getNextUnseenJoke: jest.fn().mockResolvedValue({
          id: 1,
          text: 'Test joke',
          lang: 'en',
          style: 'oneliners',
          format: 'single',
          tone: 'neutral',
          topic: 'general',
        }),
      };
    });

    it('should complete full notification setup flow', async () => {
      // Mock permissions
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id');
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      // Initialize service
      await realNotificationService.initialize();

      // Enable notifications
      const enabled = await realNotificationService.enableNotifications('10:00');
      expect(enabled).toBe(true);

      // Verify notification was scheduled
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            title: expect.any(String),
            body: expect.any(String),
          }),
          trigger: expect.objectContaining({
            hour: 10,
            minute: 0,
            repeats: true,
          }),
        })
      );

      // Get settings
      const settings = await realNotificationService.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.time).toBe('10:00');
    });

    it('should handle permission denial', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const enabled = await realNotificationService.enableNotifications();
      expect(enabled).toBe(false);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('should prepare and cache jokes', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null); // No cache
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await realNotificationService.prepareDailyJokes();

      expect((realNotificationService as any).jokeService.getNextUnseenJoke).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:cachedJokes',
        expect.any(String)
      );
    });

    it('should send immediate notification', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('immediate-id');

      const joke = {
        id: 1,
        text: 'Immediate joke',
        lang: 'en',
        style: 'oneliners',
        format: 'single',
        tone: 'neutral',
        topic: 'general',
      };

      await realNotificationService.sendJokeNotification(joke);

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            body: 'Immediate joke',
            data: expect.objectContaining({
              type: 'daily_joke',
              jokeId: 1,
            }),
          }),
          trigger: null,
        })
      );
    });
  });

  describe('Deep Link Navigation Integration', () => {
    it('should handle notification tap navigation', () => {
      const notificationData = {
        type: 'daily_joke',
        jokeId: 123,
      };

      mockNavigationService.handleNotificationNavigation(notificationData);

      expect(mockNavigationService.handleNotificationNavigation).toHaveBeenCalledWith(notificationData);
    });

    it('should navigate to specific joke', () => {
      mockNavigationService.navigateToJoke(456);

      expect(mockNavigationService.navigateToJoke).toHaveBeenCalledWith(456);
    });
  });

  describe('Background Job Integration', () => {
    it('should check background job status', async () => {
      mockBackgroundJobService.getJobStatus.mockResolvedValue({
        isRegistered: true,
        status: 'enabled',
        lastRun: '2023-01-01T00:00:00.000Z',
      });

      const status = await mockBackgroundJobService.getJobStatus();

      expect(status.isRegistered).toBe(true);
      expect(status.status).toBe('enabled');
    });

    it('should get cache statistics', async () => {
      mockBackgroundJobService.getCacheStatistics.mockResolvedValue({
        totalCached: 5,
        unusedCached: 3,
        lastPreparation: '2023-01-01T00:00:00.000Z',
        cacheHealth: 'good',
      });

      const stats = await mockBackgroundJobService.getCacheStatistics();

      expect(stats.cacheHealth).toBe('good');
      expect(stats.totalCached).toBe(5);
      expect(stats.unusedCached).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle notification service errors gracefully', async () => {
      mockNotificationService.enableNotifications.mockRejectedValue(new Error('Service error'));
      const alertSpy = jest.spyOn(Alert, 'alert');
      
      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      const notificationSwitch = getByTestId('notification-switch');
      
      act(() => {
        fireEvent(notificationSwitch, 'valueChange', true);
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Something went wrong',
          'Failed to update notification settings. Please try again.'
        );
      });
    });

    it('should handle time update errors', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:00',
      });
      mockNotificationService.updateSettings.mockRejectedValue(new Error('Time update error'));
      const alertSpy = jest.spyOn(Alert, 'alert');

      const { getByTestId } = render(<SettingsScreen />);
      
      await waitFor(() => {
        expect(mockNotificationService.getSettings).toHaveBeenCalled();
      });

      const timeButton = getByTestId('time-picker-button');
      
      act(() => {
        fireEvent.press(timeButton);
      });

      const timePicker = getByTestId('time-picker');
      
      act(() => {
        fireEvent(timePicker, 'valueChange', '10:30');
      });

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          'Something went wrong',
          'Failed to update notification time. Please try again.'
        );
      });
    });
  });

  describe('Platform-Specific Behavior', () => {
    it('should handle Android notification channels', async () => {
      (Platform as any).OS = 'android';
      
      await realNotificationService.initialize();

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'giggleglide-daily',
        expect.objectContaining({
          name: 'Daily Jokes',
          importance: expect.any(String),
        })
      );
    });

    it('should not create channels on iOS', async () => {
      (Platform as any).OS = 'ios';
      
      await realNotificationService.initialize();

      // Should not call setNotificationChannelAsync on iOS
      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    });
  });
});