import BackgroundJobService from '../BackgroundJobService';
import { NotificationService } from '../NotificationService';
import { JokeService } from '../database/JokeService';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Mock dependencies
jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: {
    NewData: 'newData',
    NoData: 'noData',
    Failed: 'failed',
  },
  BackgroundFetchStatus: {
    Available: 'available',
    Denied: 'denied',
    Restricted: 'restricted',
  },
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
  getStatusAsync: jest.fn(),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiRemove: jest.fn(),
}));

jest.mock('../NotificationService');
jest.mock('../database/JokeService');

// Mock Platform
const mockPlatform = Platform as any;

describe('BackgroundJobService', () => {
  let backgroundJobService: BackgroundJobService;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockJokeService: jest.Mocked<JokeService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPlatform.OS = 'ios'; // Default to iOS for background fetch support
    
    backgroundJobService = BackgroundJobService.getInstance();
    mockNotificationService = NotificationService.getInstance() as jest.Mocked<NotificationService>;
    mockJokeService = new JokeService() as jest.Mocked<JokeService>;
    
    // Set up mocked services
    (backgroundJobService as any).notificationService = mockNotificationService;
    (backgroundJobService as any).jokeService = mockJokeService;
  });

  describe('Initialization', () => {
    it('should initialize successfully on iOS', async () => {
      mockPlatform.OS = 'ios';
      mockJokeService.initialize.mockResolvedValue(undefined);
      mockNotificationService.prepareDailyJokes.mockResolvedValue(undefined);
      (BackgroundFetch.registerTaskAsync as jest.Mock).mockResolvedValue(undefined);

      await backgroundJobService.initialize();

      expect(mockJokeService.initialize).toHaveBeenCalled();
      expect(TaskManager.defineTask).toHaveBeenCalledTimes(2);
      expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalled();
    });

    it('should initialize successfully on Android', async () => {
      mockPlatform.OS = 'android';
      mockJokeService.initialize.mockResolvedValue(undefined);

      await backgroundJobService.initialize();

      expect(mockJokeService.initialize).toHaveBeenCalled();
      expect(TaskManager.defineTask).toHaveBeenCalledTimes(2);
      expect(BackgroundFetch.registerTaskAsync).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      mockJokeService.initialize.mockRejectedValue(new Error('Init failed'));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await backgroundJobService.initialize();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:backgroundJobStatus',
        expect.stringContaining('"status":"error"')
      );
    });
  });

  describe('Background Task Registration', () => {
    it('should register background fetch on iOS', async () => {
      mockPlatform.OS = 'ios';
      (BackgroundFetch.registerTaskAsync as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await (backgroundJobService as any).registerBackgroundFetch();

      expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalledWith(
        'background-joke-preparation',
        {
          minimumInterval: 60 * 60 * 6, // 6 hours
          stopOnTerminate: false,
          startOnBoot: true,
        }
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:backgroundJobStatus',
        expect.stringContaining('"status":"enabled"')
      );
    });

    it('should handle registration errors', async () => {
      mockPlatform.OS = 'ios';
      (BackgroundFetch.registerTaskAsync as jest.Mock).mockRejectedValue(new Error('Registration failed'));
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await (backgroundJobService as any).registerBackgroundFetch();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:backgroundJobStatus',
        expect.stringContaining('"status":"error"')
      );
    });

    it('should unregister background tasks', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
      (BackgroundFetch.unregisterTaskAsync as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await backgroundJobService.unregisterBackgroundTasks();

      expect(BackgroundFetch.unregisterTaskAsync).toHaveBeenCalledTimes(2);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:backgroundJobStatus',
        expect.stringContaining('"status":"disabled"')
      );
    });
  });

  describe('Joke Preparation', () => {
    it('should prepare daily jokes successfully', async () => {
      mockNotificationService.prepareDailyJokes.mockResolvedValue(undefined);
      mockNotificationService.cleanupCache.mockResolvedValue(undefined);

      await (backgroundJobService as any).prepareDailyJokes();

      expect(mockNotificationService.prepareDailyJokes).toHaveBeenCalled();
      expect(mockNotificationService.cleanupCache).toHaveBeenCalled();
    });

    it('should handle joke preparation errors', async () => {
      mockNotificationService.prepareDailyJokes.mockRejectedValue(new Error('Preparation failed'));

      await expect((backgroundJobService as any).prepareDailyJokes()).rejects.toThrow('Preparation failed');
    });

    it('should trigger joke preparation manually', async () => {
      mockNotificationService.prepareDailyJokes.mockResolvedValue(undefined);
      mockNotificationService.cleanupCache.mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const result = await backgroundJobService.triggerJokePreparation();

      expect(result).toBe(true);
      expect(mockNotificationService.prepareDailyJokes).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:lastBackgroundRun',
        expect.any(String)
      );
    });

    it('should handle manual trigger failures', async () => {
      mockNotificationService.prepareDailyJokes.mockRejectedValue(new Error('Trigger failed'));

      const result = await backgroundJobService.triggerJokePreparation();

      expect(result).toBe(false);
    });
  });

  describe('Status Management', () => {
    it('should get default job status when none exists', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(null) // No status
        .mockResolvedValueOnce(null); // No last run

      const status = await backgroundJobService.getJobStatus();

      expect(status).toEqual({
        isRegistered: false,
        status: 'disabled',
        lastRun: undefined,
      });
    });

    it('should get saved job status', async () => {
      const savedStatus = {
        isRegistered: true,
        status: 'enabled',
        errorMessage: null,
      };
      const lastRun = '2023-01-01T00:00:00.000Z';

      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(JSON.stringify(savedStatus)) // Status
        .mockResolvedValueOnce(lastRun); // Last run

      const status = await backgroundJobService.getJobStatus();

      expect(status).toEqual({
        isRegistered: true,
        status: 'enabled',
        errorMessage: null,
        lastRun,
      });
    });

    it('should handle status retrieval errors', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const status = await backgroundJobService.getJobStatus();

      expect(status.status).toBe('error');
      expect(status.errorMessage).toBe('Storage error');
    });
  });

  describe('Platform Support', () => {
    it('should return true for iOS background job support', () => {
      mockPlatform.OS = 'ios';
      const isSupported = backgroundJobService.isBackgroundJobSupported();
      expect(isSupported).toBe(true);
    });

    it('should return false for Android background job support', () => {
      mockPlatform.OS = 'android';
      const isSupported = backgroundJobService.isBackgroundJobSupported();
      expect(isSupported).toBe(false);
    });

    it('should get background job permissions on iOS', async () => {
      mockPlatform.OS = 'ios';
      (BackgroundFetch.getStatusAsync as jest.Mock).mockResolvedValue('available');

      const permissions = await backgroundJobService.getBackgroundJobPermissions();

      expect(permissions).toBe('granted');
      expect(BackgroundFetch.getStatusAsync).toHaveBeenCalled();
    });

    it('should return granted permissions for Android', async () => {
      mockPlatform.OS = 'android';

      const permissions = await backgroundJobService.getBackgroundJobPermissions();

      expect(permissions).toBe('granted');
      expect(BackgroundFetch.getStatusAsync).not.toHaveBeenCalled();
    });
  });

  describe('Enable/Disable Background Jobs', () => {
    it('should enable background jobs on supported platforms', async () => {
      mockPlatform.OS = 'ios';
      (BackgroundFetch.registerTaskAsync as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const result = await backgroundJobService.enableBackgroundJobs();

      expect(result).toBe(true);
      expect(BackgroundFetch.registerTaskAsync).toHaveBeenCalled();
    });

    it('should enable background jobs on unsupported platforms', async () => {
      mockPlatform.OS = 'android';
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const result = await backgroundJobService.enableBackgroundJobs();

      expect(result).toBe(true);
      expect(BackgroundFetch.registerTaskAsync).not.toHaveBeenCalled();
    });

    it('should handle enable errors', async () => {
      mockPlatform.OS = 'ios';
      (BackgroundFetch.registerTaskAsync as jest.Mock).mockRejectedValue(new Error('Enable failed'));

      const result = await backgroundJobService.enableBackgroundJobs();

      expect(result).toBe(false);
    });

    it('should disable background jobs', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
      (BackgroundFetch.unregisterTaskAsync as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await backgroundJobService.disableBackgroundJobs();

      expect(BackgroundFetch.unregisterTaskAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cache Statistics', () => {
    it('should get cache statistics', async () => {
      const mockStats = {
        enabled: true,
        lastScheduled: '2023-01-01',
        cachedJokesCount: 5,
        unusedJokesCount: 3,
        permissions: true,
      };
      const lastRun = '2023-01-01T12:00:00.000Z';

      mockNotificationService.getNotificationStats.mockResolvedValue(mockStats);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(lastRun);

      const stats = await backgroundJobService.getCacheStatistics();

      expect(stats).toEqual({
        totalCached: 5,
        unusedCached: 3,
        lastPreparation: lastRun,
        cacheHealth: 'good',
      });
    });

    it('should return correct cache health status', async () => {
      // Test 'good' health
      mockNotificationService.getNotificationStats.mockResolvedValue({
        unusedJokesCount: 5,
        cachedJokesCount: 7,
        enabled: true,
        permissions: true,
      });
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('2023-01-01');

      let stats = await backgroundJobService.getCacheStatistics();
      expect(stats.cacheHealth).toBe('good');

      // Test 'low' health
      mockNotificationService.getNotificationStats.mockResolvedValue({
        unusedJokesCount: 1,
        cachedJokesCount: 2,
        enabled: true,
        permissions: true,
      });

      stats = await backgroundJobService.getCacheStatistics();
      expect(stats.cacheHealth).toBe('low');

      // Test 'empty' health
      mockNotificationService.getNotificationStats.mockResolvedValue({
        unusedJokesCount: 0,
        cachedJokesCount: 0,
        enabled: true,
        permissions: true,
      });

      stats = await backgroundJobService.getCacheStatistics();
      expect(stats.cacheHealth).toBe('empty');
    });

    it('should handle cache statistics errors', async () => {
      mockNotificationService.getNotificationStats.mockRejectedValue(new Error('Stats error'));

      const stats = await backgroundJobService.getCacheStatistics();

      expect(stats).toEqual({
        totalCached: 0,
        unusedCached: 0,
        cacheHealth: 'empty',
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all background job data', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockResolvedValue(true);
      (BackgroundFetch.unregisterTaskAsync as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await backgroundJobService.cleanup();

      expect(BackgroundFetch.unregisterTaskAsync).toHaveBeenCalledTimes(2);
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        '@GiggleGlide:lastBackgroundRun',
        '@GiggleGlide:backgroundJobStatus',
        '@GiggleGlide:lastNotificationSent',
      ]);
    });

    it('should handle cleanup errors gracefully', async () => {
      (TaskManager.isTaskRegisteredAsync as jest.Mock).mockRejectedValue(new Error('Cleanup error'));

      // Should not throw
      await expect(backgroundJobService.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('Scheduled Notification Processing', () => {
    beforeEach(() => {
      // Mock Date to control time
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2023-01-01T09:30:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should process scheduled notifications at correct time', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:30',
      });
      mockNotificationService.getJokeForNotification.mockResolvedValue({
        joke: { id: 1, text: 'Test joke', lang: 'en', style: 'oneliners', format: 'single', tone: 'neutral', topic: 'general' },
        text: 'Test joke',
      });
      mockNotificationService.sendJokeNotification.mockResolvedValue(undefined);

      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce(null) // No last sent notification
        .mockResolvedValueOnce(undefined) // Set last sent
        .mockResolvedValueOnce(undefined); // Set last sent (second call)

      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await (backgroundJobService as any).processScheduledNotifications();

      expect(mockNotificationService.sendJokeNotification).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:lastNotificationSent',
        'Sun Jan 01 2023'
      );
    });

    it('should not process notifications when disabled', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: false,
        time: '09:30',
      });

      await (backgroundJobService as any).processScheduledNotifications();

      expect(mockNotificationService.sendJokeNotification).not.toHaveBeenCalled();
    });

    it('should not send duplicate notifications on same day', async () => {
      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:30',
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('Sun Jan 01 2023'); // Already sent today

      await (backgroundJobService as any).processScheduledNotifications();

      expect(mockNotificationService.sendJokeNotification).not.toHaveBeenCalled();
    });

    it('should not send notifications outside scheduled time', async () => {
      jest.setSystemTime(new Date('2023-01-01T10:30:00.000Z')); // Wrong hour

      mockNotificationService.getSettings.mockResolvedValue({
        enabled: true,
        time: '09:30',
      });

      await (backgroundJobService as any).processScheduledNotifications();

      expect(mockNotificationService.sendJokeNotification).not.toHaveBeenCalled();
    });
  });
});