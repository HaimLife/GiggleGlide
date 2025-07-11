import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { NotificationService } from './NotificationService';
import { JokeService } from './database/JokeService';

// Background task identifiers
const BACKGROUND_JOKE_PREPARATION = 'background-joke-preparation';
const BACKGROUND_NOTIFICATION_TASK = 'background-notification-task';

export interface BackgroundJobStatus {
  isRegistered: boolean;
  lastRun?: string;
  nextRun?: string;
  status: 'enabled' | 'disabled' | 'error';
  errorMessage?: string;
}

export class BackgroundJobService {
  private static instance: BackgroundJobService;
  private notificationService: NotificationService;
  private jokeService: JokeService;
  private readonly LAST_RUN_KEY = '@GiggleGlide:lastBackgroundRun';
  private readonly JOB_STATUS_KEY = '@GiggleGlide:backgroundJobStatus';

  private constructor() {
    this.notificationService = NotificationService.getInstance();
    this.jokeService = new JokeService();
  }

  static getInstance(): BackgroundJobService {
    if (!BackgroundJobService.instance) {
      BackgroundJobService.instance = new BackgroundJobService();
    }
    return BackgroundJobService.instance;
  }

  /**
   * Initialize background job service
   */
  async initialize(): Promise<void> {
    try {
      await this.jokeService.initialize();
      await this.defineBackgroundTasks();
      
      // Register background fetch if supported
      if (Platform.OS === 'ios') {
        await this.registerBackgroundFetch();
      }
      
      console.log('BackgroundJobService initialized');
    } catch (error) {
      console.error('Failed to initialize BackgroundJobService:', error);
      await this.updateJobStatus('error', error.message);
    }
  }

  /**
   * Define background tasks
   */
  private async defineBackgroundTasks(): Promise<void> {
    // Task for preparing daily jokes
    TaskManager.defineTask(BACKGROUND_JOKE_PREPARATION, async () => {
      try {
        console.log('Running background joke preparation...');
        await this.prepareDailyJokes();
        await this.updateLastRun();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('Background joke preparation failed:', error);
        await this.updateJobStatus('error', error.message);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });

    // Task for sending scheduled notifications
    TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async () => {
      try {
        console.log('Running background notification task...');
        await this.processScheduledNotifications();
        return BackgroundFetch.BackgroundFetchResult.NewData;
      } catch (error) {
        console.error('Background notification task failed:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
      }
    });
  }

  /**
   * Register background fetch for iOS
   */
  private async registerBackgroundFetch(): Promise<void> {
    try {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_JOKE_PREPARATION, {
        minimumInterval: 60 * 60 * 6, // Run every 6 hours minimum
        stopOnTerminate: false,
        startOnBoot: true,
      });

      await this.updateJobStatus('enabled');
      console.log('Background fetch registered');
    } catch (error) {
      console.error('Failed to register background fetch:', error);
      await this.updateJobStatus('error', error.message);
    }
  }

  /**
   * Unregister background tasks
   */
  async unregisterBackgroundTasks(): Promise<void> {
    try {
      if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_JOKE_PREPARATION)) {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_JOKE_PREPARATION);
      }
      
      if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK)) {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_NOTIFICATION_TASK);
      }

      await this.updateJobStatus('disabled');
      console.log('Background tasks unregistered');
    } catch (error) {
      console.error('Failed to unregister background tasks:', error);
    }
  }

  /**
   * Prepare daily jokes in background
   */
  private async prepareDailyJokes(): Promise<void> {
    try {
      // Prepare jokes for the notification service
      await this.notificationService.prepareDailyJokes();
      
      // Clean up old cached jokes
      await this.notificationService.cleanupCache();
      
      console.log('Daily jokes prepared successfully');
    } catch (error) {
      console.error('Failed to prepare daily jokes:', error);
      throw error;
    }
  }

  /**
   * Process scheduled notifications (for Android or fallback)
   */
  private async processScheduledNotifications(): Promise<void> {
    try {
      const settings = await this.notificationService.getSettings();
      
      if (!settings.enabled) {
        return;
      }

      // Check if it's time to send a notification
      const now = new Date();
      const [targetHour, targetMinute] = settings.time.split(':').map(Number);
      
      // Only send if we're within the target hour and haven't sent today
      if (now.getHours() === targetHour && now.getMinutes() >= targetMinute) {
        const lastSent = await this.getLastNotificationSent();
        const today = now.toDateString();
        
        if (lastSent !== today) {
          const jokeData = await this.notificationService.getJokeForNotification();
          if (jokeData) {
            await this.notificationService.sendJokeNotification(jokeData.joke);
            await this.setLastNotificationSent(today);
          }
        }
      }
    } catch (error) {
      console.error('Failed to process scheduled notifications:', error);
      throw error;
    }
  }

  /**
   * Manually trigger joke preparation
   */
  async triggerJokePreparation(): Promise<boolean> {
    try {
      await this.prepareDailyJokes();
      await this.updateLastRun();
      return true;
    } catch (error) {
      console.error('Failed to trigger joke preparation:', error);
      return false;
    }
  }

  /**
   * Get background job status
   */
  async getJobStatus(): Promise<BackgroundJobStatus> {
    try {
      const statusJson = await AsyncStorage.getItem(this.JOB_STATUS_KEY);
      const lastRun = await this.getLastRun();
      
      const defaultStatus: BackgroundJobStatus = {
        isRegistered: false,
        status: 'disabled',
      };

      if (!statusJson) {
        return { ...defaultStatus, lastRun };
      }

      const status = JSON.parse(statusJson);
      return { ...defaultStatus, ...status, lastRun };
    } catch (error) {
      console.error('Failed to get job status:', error);
      return {
        isRegistered: false,
        status: 'error',
        errorMessage: error.message,
      };
    }
  }

  /**
   * Update job status
   */
  private async updateJobStatus(status: 'enabled' | 'disabled' | 'error', errorMessage?: string): Promise<void> {
    try {
      const jobStatus: Partial<BackgroundJobStatus> = {
        isRegistered: status === 'enabled',
        status,
        errorMessage,
      };

      await AsyncStorage.setItem(this.JOB_STATUS_KEY, JSON.stringify(jobStatus));
    } catch (error) {
      console.error('Failed to update job status:', error);
    }
  }

  /**
   * Get last run timestamp
   */
  private async getLastRun(): Promise<string | undefined> {
    try {
      return await AsyncStorage.getItem(this.LAST_RUN_KEY) || undefined;
    } catch (error) {
      console.error('Failed to get last run:', error);
      return undefined;
    }
  }

  /**
   * Update last run timestamp
   */
  private async updateLastRun(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.LAST_RUN_KEY, new Date().toISOString());
    } catch (error) {
      console.error('Failed to update last run:', error);
    }
  }

  /**
   * Get last notification sent date
   */
  private async getLastNotificationSent(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('@GiggleGlide:lastNotificationSent');
    } catch (error) {
      console.error('Failed to get last notification sent:', error);
      return null;
    }
  }

  /**
   * Set last notification sent date
   */
  private async setLastNotificationSent(date: string): Promise<void> {
    try {
      await AsyncStorage.setItem('@GiggleGlide:lastNotificationSent', date);
    } catch (error) {
      console.error('Failed to set last notification sent:', error);
    }
  }

  /**
   * Check if background jobs are available on this platform
   */
  isBackgroundJobSupported(): boolean {
    return Platform.OS === 'ios'; // Background fetch is primarily iOS
  }

  /**
   * Get background job permissions status
   */
  async getBackgroundJobPermissions(): Promise<'granted' | 'denied' | 'restricted' | 'unknown'> {
    try {
      if (Platform.OS === 'ios') {
        const status = await BackgroundFetch.getStatusAsync();
        
        switch (status) {
          case BackgroundFetch.BackgroundFetchStatus.Available:
            return 'granted';
          case BackgroundFetch.BackgroundFetchStatus.Denied:
            return 'denied';
          case BackgroundFetch.BackgroundFetchStatus.Restricted:
            return 'restricted';
          default:
            return 'unknown';
        }
      }
      
      return 'granted'; // Android doesn't have explicit background permissions for this
    } catch (error) {
      console.error('Failed to get background job permissions:', error);
      return 'unknown';
    }
  }

  /**
   * Enable background jobs
   */
  async enableBackgroundJobs(): Promise<boolean> {
    try {
      if (this.isBackgroundJobSupported()) {
        await this.registerBackgroundFetch();
        return true;
      } else {
        // For Android, we rely on local notifications scheduler
        await this.updateJobStatus('enabled');
        return true;
      }
    } catch (error) {
      console.error('Failed to enable background jobs:', error);
      return false;
    }
  }

  /**
   * Disable background jobs
   */
  async disableBackgroundJobs(): Promise<void> {
    try {
      await this.unregisterBackgroundTasks();
    } catch (error) {
      console.error('Failed to disable background jobs:', error);
    }
  }

  /**
   * Get joke cache statistics
   */
  async getCacheStatistics(): Promise<{
    totalCached: number;
    unusedCached: number;
    lastPreparation?: string;
    cacheHealth: 'good' | 'low' | 'empty';
  }> {
    try {
      const stats = await this.notificationService.getNotificationStats();
      const lastRun = await this.getLastRun();
      
      let cacheHealth: 'good' | 'low' | 'empty' = 'empty';
      
      if (stats.unusedJokesCount >= 3) {
        cacheHealth = 'good';
      } else if (stats.unusedJokesCount > 0) {
        cacheHealth = 'low';
      }

      return {
        totalCached: stats.cachedJokesCount,
        unusedCached: stats.unusedJokesCount,
        lastPreparation: lastRun,
        cacheHealth,
      };
    } catch (error) {
      console.error('Failed to get cache statistics:', error);
      return {
        totalCached: 0,
        unusedCached: 0,
        cacheHealth: 'empty',
      };
    }
  }

  /**
   * Clean up all background job data
   */
  async cleanup(): Promise<void> {
    try {
      await this.unregisterBackgroundTasks();
      await AsyncStorage.multiRemove([
        this.LAST_RUN_KEY,
        this.JOB_STATUS_KEY,
        '@GiggleGlide:lastNotificationSent',
      ]);
      
      console.log('Background job service cleaned up');
    } catch (error) {
      console.error('Failed to cleanup background job service:', error);
    }
  }
}

export default BackgroundJobService;