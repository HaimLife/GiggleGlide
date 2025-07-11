import { NotificationService } from '../NotificationService';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { JokeService } from '../database/JokeService';

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
  multiRemove: jest.fn(),
}));

jest.mock('../database/JokeService');

jest.mock('i18next', () => ({
  t: jest.fn((key: string) => {
    const translations: { [key: string]: string } = {
      'notifications.dailyJokeTitle': 'Daily Joke Time! 😄',
      'notifications.dailyJokeBody': 'Ready for your daily dose of laughter?',
      'notifications.freshJokeTitle': 'Fresh Joke! 😄',
      'notifications.freshJokeBody': 'Tap to see a funny joke!',
      'notifications.testTitle': 'Test Notification 🧪',
      'notifications.testBody': 'If you can see this, notifications are working!',
    };
    return translations[key] || key;
  }),
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockJokeService: jest.Mocked<JokeService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    notificationService = NotificationService.getInstance();
    mockJokeService = new JokeService() as jest.Mocked<JokeService>;
    mockJokeService.initialize = jest.fn().mockResolvedValue(undefined);
    (notificationService as any).jokeService = mockJokeService;
    (notificationService as any).initialized = true; // Skip initialization
  });

  describe('Permissions', () => {
    it('should request permissions successfully', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const result = await notificationService.requestPermissions();

      expect(result).toBe(true);
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
    });

    it('should handle permission denial', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const result = await notificationService.requestPermissions();

      expect(result).toBe(false);
    });

    it('should check existing permissions', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const result = await notificationService.checkPermissions();

      expect(result).toBe(true);
      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
    });
  });

  describe('Settings Management', () => {
    it('should get default settings when none exist', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const settings = await notificationService.getSettings();

      expect(settings).toEqual({
        enabled: false,
        time: '09:00',
        cacheSize: 7,
      });
    });

    it('should get saved settings', async () => {
      const savedSettings = {
        enabled: true,
        time: '10:30',
        lastScheduled: '2023-01-01T00:00:00.000Z',
      };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(savedSettings));

      const settings = await notificationService.getSettings();

      expect(settings.enabled).toBe(true);
      expect(settings.time).toBe('10:30');
      expect(settings.lastScheduled).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should update settings and reschedule notifications', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
        enabled: false,
        time: '09:00',
      }));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(undefined);
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id');
      mockJokeService.getNextUnseenJoke.mockResolvedValue({
        id: 1,
        text: 'Test joke',
        lang: 'en',
        style: 'oneliners',
        format: 'single',
        tone: 'neutral',
        topic: 'general',
      });

      await notificationService.updateSettings({ enabled: true, time: '10:00' });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:notificationSettings',
        expect.stringContaining('"enabled":true')
      );
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });
  });

  describe('Notification Scheduling', () => {
    beforeEach(() => {
      mockJokeService.initialize.mockResolvedValue(undefined);
      mockJokeService.getNextUnseenJoke.mockResolvedValue({
        id: 1,
        text: 'Test joke',
        lang: 'en',
        style: 'oneliners',
        format: 'single',
        tone: 'neutral',
        topic: 'general',
      });
    });

    it('should schedule daily notifications', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
        enabled: true,
        time: '09:30',
      }));
      (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(undefined);
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id');
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await notificationService.scheduleNotifications('09:30');

      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Daily Joke Time! 😄',
          body: 'Ready for your daily dose of laughter?',
          data: {
            type: 'daily_joke',
            scheduledFor: '09:30',
          },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          hour: 9,
          minute: 30,
          repeats: true,
          channelId: undefined, // Not Android in test environment
        },
      });
    });

    it('should handle invalid time format', async () => {
      await expect(notificationService.scheduleNotifications('invalid-time')).rejects.toThrow(
        'Invalid time format. Use HH:MM'
      );
    });

    it('should not schedule when notifications are disabled', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
        enabled: false,
        time: '09:00',
      }));

      await notificationService.scheduleNotifications('09:00');

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('should cancel all notifications', async () => {
      (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(undefined);

      await notificationService.cancelAllNotifications();

      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });

  describe('Enable/Disable Notifications', () => {
    it('should enable notifications with permissions', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
        enabled: false,
        time: '09:00',
      }));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id');
      mockJokeService.initialize.mockResolvedValue(undefined);

      const result = await notificationService.enableNotifications('10:00');

      expect(result).toBe(true);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });

    it('should fail to enable notifications without permissions', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const result = await notificationService.enableNotifications();

      expect(result).toBe(false);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('should disable notifications', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({
        enabled: true,
        time: '09:00',
      }));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
      (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(undefined);

      await notificationService.disableNotifications();

      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });

  describe('Joke Caching and Preparation', () => {
    beforeEach(() => {
      mockJokeService.initialize.mockResolvedValue(undefined);
    });

    it('should prepare daily jokes', async () => {
      const mockJokes = [
        { id: 1, text: 'Joke 1', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
        { id: 2, text: 'Joke 2', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
      ];
      
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(null) // No cached jokes initially
        .mockResolvedValueOnce(JSON.stringify([])); // Empty cache on save

      mockJokeService.getNextUnseenJoke
        .mockResolvedValueOnce(mockJokes[0])
        .mockResolvedValueOnce(mockJokes[1]);

      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await notificationService.prepareDailyJokes();

      expect(mockJokeService.getNextUnseenJoke).toHaveBeenCalledTimes(7); // Should cache 7 jokes
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:cachedJokes',
        expect.any(String)
      );
    });

    it('should get joke for notification', async () => {
      const mockCachedJoke = {
        joke: { id: 1, text: 'Cached joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
        cachedAt: Date.now() - 1000, // Fresh joke
        used: false,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([mockCachedJoke]));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const result = await notificationService.getJokeForNotification();

      expect(result).toEqual({
        joke: mockCachedJoke.joke,
        text: 'Cached joke',
      });
      
      // Verify the joke was marked as used
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:cachedJokes',
        expect.stringContaining('"used":true')
      );
    });

    it('should fallback to fresh joke when cache is empty', async () => {
      const mockJoke = { id: 1, text: 'Fresh joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' };
      
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([])); // Empty cache
      mockJokeService.getNextUnseenJoke.mockResolvedValue(mockJoke);

      const result = await notificationService.getJokeForNotification();

      expect(result).toEqual({
        joke: mockJoke,
        text: 'Fresh joke',
      });
    });

    it('should clean up old cached jokes', async () => {
      const oldJoke = {
        joke: { id: 1, text: 'Old joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
        cachedAt: Date.now() - (25 * 60 * 60 * 1000), // 25 hours old
        used: false,
      };
      
      const freshJoke = {
        joke: { id: 2, text: 'Fresh joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
        cachedAt: Date.now() - 1000, // Fresh
        used: false,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([oldJoke, freshJoke]));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await notificationService.cleanupCache();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:cachedJokes',
        JSON.stringify([freshJoke])
      );
    });
  });

  describe('Immediate Notifications', () => {
    beforeEach(() => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id');
    });

    it('should send immediate notification with specific joke', async () => {
      const mockJoke = { id: 1, text: 'Test joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' };

      await notificationService.sendJokeNotification(mockJoke);

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Fresh Joke! 😄',
          body: 'Test joke',
          data: {
            type: 'daily_joke',
            jokeId: 1,
            jokeText: 'Test joke',
          },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    });

    it('should send immediate notification with cached joke', async () => {
      const mockCachedJoke = {
        joke: { id: 1, text: 'Cached joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
        cachedAt: Date.now() - 1000,
        used: false,
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify([mockCachedJoke]));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await notificationService.sendJokeNotification();

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Fresh Joke! 😄',
          body: 'Cached joke',
          data: {
            type: 'daily_joke',
            jokeId: 1,
            jokeText: 'Cached joke',
          },
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null,
      });
    });

    it('should not send notification without permissions', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const mockJoke = { id: 1, text: 'Test joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' };

      await notificationService.sendJokeNotification(mockJoke);

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('Test Notifications', () => {
    it('should send test notification', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('test-notification-id');

      const result = await notificationService.testNotification();

      expect(result).toBe(true);
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Test Notification 🧪',
          body: 'If you can see this, notifications are working!',
          data: { type: 'test' },
        },
        trigger: { seconds: 1 },
      });
    });

    it('should fail test notification without permissions', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      const result = await notificationService.testNotification();

      expect(result).toBe(false);
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('Joke Formatting', () => {
    it('should format setup/punchline joke for notification', async () => {
      const joke = {
        id: 1,
        setup: 'Why did the chicken cross the road?',
        punchline: 'To get to the other side!',
        lang: 'en',
        style: 'oneliners',
        format: 'setup_punchline',
        tone: 'neutral',
        topic: 'general',
      };

      const formatted = (notificationService as any).formatJokeForNotification(joke);

      expect(formatted).toBe('Why did the chicken cross the road?');
    });

    it('should format single text joke for notification', async () => {
      const joke = {
        id: 1,
        text: 'This is a funny one-liner joke that should be displayed in the notification.',
        lang: 'en',
        style: 'oneliners',
        format: 'single',
        tone: 'neutral',
        topic: 'general',
      };

      const formatted = (notificationService as any).formatJokeForNotification(joke);

      expect(formatted).toBe('This is a funny one-liner joke that should be displayed in the notification.');
    });

    it('should truncate long joke text', async () => {
      const longText = 'This is a very long joke text that exceeds the maximum character limit for notifications and should be truncated with ellipsis at the end to fit properly in the notification display area.';
      
      const joke = {
        id: 1,
        text: longText,
        lang: 'en',
        style: 'oneliners',
        format: 'single',
        tone: 'neutral',
        topic: 'general',
      };

      const formatted = (notificationService as any).formatJokeForNotification(joke);

      expect(formatted.length).toBeLessThanOrEqual(120);
      expect(formatted.endsWith('...')).toBe(true);
    });

    it('should use fallback text for empty joke', async () => {
      const joke = {
        id: 1,
        lang: 'en',
        style: 'oneliners',
        format: 'single',
        tone: 'neutral',
        topic: 'general',
      };

      const formatted = (notificationService as any).formatJokeForNotification(joke);

      expect(formatted).toBe('Tap to see a funny joke!');
    });
  });

  describe('Statistics', () => {
    it('should get notification stats', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify({ enabled: true, time: '09:00', lastScheduled: '2023-01-01' })) // Settings
        .mockResolvedValueOnce(JSON.stringify([
          { joke: { id: 1 }, cachedAt: Date.now() - 1000, used: false },
          { joke: { id: 2 }, cachedAt: Date.now() - 1000, used: true },
        ])); // Cached jokes
      
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      const stats = await notificationService.getNotificationStats();

      expect(stats).toEqual({
        enabled: true,
        lastScheduled: '2023-01-01',
        cachedJokesCount: 2,
        unusedJokesCount: 1,
        permissions: true,
      });
    });
  });
});