import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { JokeService } from './database/JokeService';
import { Joke } from './database/types';

export interface NotificationSettings {
  enabled: boolean;
  time: string; // Format: "HH:MM"
  lastScheduled?: string;
  cacheSize?: number;
}

export interface CachedJoke {
  joke: Joke;
  cachedAt: number;
  used: boolean;
}

export interface NotificationPayload {
  type: 'daily_joke';
  jokeId?: number;
  jokeText?: string;
  scheduledFor?: string;
}

export class NotificationService {
  private static instance: NotificationService;
  private jokeService: JokeService;
  private readonly STORAGE_KEY = '@GiggleGlide:notificationSettings';
  private readonly CACHE_KEY = '@GiggleGlide:cachedJokes';
  private readonly USER_ID = 'default'; // For single-user app
  private readonly MAX_CACHE_SIZE = 7; // Cache jokes for 7 days
  private readonly CACHE_EXPIRY_HOURS = 24; // Cache expires after 24 hours

  private constructor() {
    this.jokeService = new JokeService();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    try {
      await this.jokeService.initialize();
      
      // Set up Android notification channel if needed
      if (Platform.OS === 'android') {
        await this.createNotificationChannel();
      }

      // Pre-cache jokes on initialization
      await this.prepareDailyJokes();
    } catch (error) {
      console.error('Failed to initialize NotificationService:', error);
    }
  }

  /**
   * Create Android notification channel
   */
  private async createNotificationChannel(): Promise<void> {
    await Notifications.setNotificationChannelAsync('giggleglide-daily', {
      name: 'Daily Jokes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#667eea',
      sound: 'default',
      description: 'Daily joke notifications to brighten your day',
    });
  }

  /**
   * Request notification permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch (error) {
      console.error('Failed to request notification permissions:', error);
      return false;
    }
  }

  /**
   * Check if notifications are permitted
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to check notification permissions:', error);
      return false;
    }
  }

  /**
   * Get current notification settings
   */
  async getSettings(): Promise<NotificationSettings> {
    try {
      const settingsJson = await AsyncStorage.getItem(this.STORAGE_KEY);
      const defaultSettings: NotificationSettings = {
        enabled: false,
        time: '09:00',
        cacheSize: this.MAX_CACHE_SIZE,
      };

      if (!settingsJson) {
        return defaultSettings;
      }

      return { ...defaultSettings, ...JSON.parse(settingsJson) };
    } catch (error) {
      console.error('Failed to get notification settings:', error);
      return {
        enabled: false,
        time: '09:00',
        cacheSize: this.MAX_CACHE_SIZE,
      };
    }
  }

  /**
   * Update notification settings
   */
  async updateSettings(settings: Partial<NotificationSettings>): Promise<void> {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = { ...currentSettings, ...settings };
      
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(newSettings));

      // Reschedule notifications if enabled
      if (newSettings.enabled) {
        await this.scheduleNotifications(newSettings.time);
      } else {
        await this.cancelAllNotifications();
      }
    } catch (error) {
      console.error('Failed to update notification settings:', error);
      throw error;
    }
  }

  /**
   * Enable notifications
   */
  async enableNotifications(time: string = '09:00'): Promise<boolean> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return false;
      }

      await this.updateSettings({ enabled: true, time });
      return true;
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      return false;
    }
  }

  /**
   * Disable notifications
   */
  async disableNotifications(): Promise<void> {
    try {
      await this.updateSettings({ enabled: false });
      await this.cancelAllNotifications();
    } catch (error) {
      console.error('Failed to disable notifications:', error);
      throw error;
    }
  }

  /**
   * Schedule daily notifications
   */
  async scheduleNotifications(time: string): Promise<void> {
    try {
      // Cancel existing notifications first
      await this.cancelAllNotifications();

      const settings = await this.getSettings();
      if (!settings.enabled) {
        return;
      }

      // Parse time
      const [hours, minutes] = time.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time format. Use HH:MM');
      }

      // Ensure we have cached jokes
      await this.prepareDailyJokes();

      // Schedule the repeating notification
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: i18next.t('notifications.dailyJokeTitle'),
          body: i18next.t('notifications.dailyJokeBody'),
          data: {
            type: 'daily_joke',
            scheduledFor: time,
          } as NotificationPayload,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          hour: hours,
          minute: minutes,
          repeats: true,
          channelId: Platform.OS === 'android' ? 'giggleglide-daily' : undefined,
        },
      });

      // Update settings with last scheduled time
      await this.updateSettings({ 
        lastScheduled: new Date().toISOString(),
        time 
      });

      console.log(`Scheduled daily notification at ${time} with ID: ${notificationId}`);
    } catch (error) {
      console.error('Failed to schedule notifications:', error);
      throw error;
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('Cancelled all scheduled notifications');
    } catch (error) {
      console.error('Failed to cancel notifications:', error);
      throw error;
    }
  }

  /**
   * Prepare daily jokes by caching them
   */
  async prepareDailyJokes(): Promise<void> {
    try {
      const cachedJokes = await this.getCachedJokes();
      const unusedJokes = cachedJokes.filter(c => !c.used && this.isJokeFresh(c));

      // If we have enough fresh jokes, we're good
      if (unusedJokes.length >= 3) {
        return;
      }

      // Need to cache more jokes
      const jokesToCache = this.MAX_CACHE_SIZE - unusedJokes.length;
      const newJokes: CachedJoke[] = [];

      for (let i = 0; i < jokesToCache; i++) {
        const joke = await this.jokeService.getNextUnseenJoke(this.USER_ID);
        if (joke) {
          newJokes.push({
            joke,
            cachedAt: Date.now(),
            used: false,
          });
        }
      }

      // Combine with existing unused jokes and save
      const allCachedJokes = [...unusedJokes, ...newJokes];
      await this.saveCachedJokes(allCachedJokes);

      console.log(`Cached ${newJokes.length} new jokes. Total cache: ${allCachedJokes.length}`);
    } catch (error) {
      console.error('Failed to prepare daily jokes:', error);
    }
  }

  /**
   * Get a cached joke for notification
   */
  async getJokeForNotification(): Promise<{ joke: Joke; text: string } | null> {
    try {
      const cachedJokes = await this.getCachedJokes();
      const availableJokes = cachedJokes.filter(c => !c.used && this.isJokeFresh(c));

      if (availableJokes.length === 0) {
        // Try to get a fresh joke directly
        const joke = await this.jokeService.getNextUnseenJoke(this.USER_ID);
        if (joke) {
          return {
            joke,
            text: this.formatJokeForNotification(joke),
          };
        }
        return null;
      }

      // Use the first available cached joke
      const selectedCached = availableJokes[0];
      selectedCached.used = true;

      // Update cache
      await this.saveCachedJokes(cachedJokes);

      return {
        joke: selectedCached.joke,
        text: this.formatJokeForNotification(selectedCached.joke),
      };
    } catch (error) {
      console.error('Failed to get joke for notification:', error);
      return null;
    }
  }

  /**
   * Send immediate notification with a specific joke
   */
  async sendJokeNotification(joke?: Joke): Promise<void> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        console.warn('No notification permission, cannot send joke notification');
        return;
      }

      let jokeToSend = joke;
      let jokeText = '';

      if (!jokeToSend) {
        const jokeData = await this.getJokeForNotification();
        if (!jokeData) {
          console.warn('No joke available for notification');
          return;
        }
        jokeToSend = jokeData.joke;
        jokeText = jokeData.text;
      } else {
        jokeText = this.formatJokeForNotification(jokeToSend);
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18next.t('notifications.freshJokeTitle'),
          body: jokeText,
          data: {
            type: 'daily_joke',
            jokeId: jokeToSend.id,
            jokeText: jokeText,
          } as NotificationPayload,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Send immediately
      });

      console.log('Sent immediate joke notification');
    } catch (error) {
      console.error('Failed to send joke notification:', error);
      throw error;
    }
  }

  /**
   * Format joke for notification display
   */
  private formatJokeForNotification(joke: Joke): string {
    let text = '';
    
    if (joke.setup && joke.punchline) {
      // For setup/punchline jokes, show just the setup
      text = joke.setup;
      if (text.length > 100) {
        text = text.substring(0, 97) + '...';
      }
    } else if (joke.text) {
      // For single-line jokes
      text = joke.text;
      if (text.length > 120) {
        text = text.substring(0, 117) + '...';
      }
    } else {
      text = i18next.t('notifications.freshJokeBody');
    }

    return text;
  }

  /**
   * Get cached jokes from storage
   */
  private async getCachedJokes(): Promise<CachedJoke[]> {
    try {
      const cacheJson = await AsyncStorage.getItem(this.CACHE_KEY);
      if (!cacheJson) {
        return [];
      }
      return JSON.parse(cacheJson);
    } catch (error) {
      console.error('Failed to get cached jokes:', error);
      return [];
    }
  }

  /**
   * Save cached jokes to storage
   */
  private async saveCachedJokes(jokes: CachedJoke[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.CACHE_KEY, JSON.stringify(jokes));
    } catch (error) {
      console.error('Failed to save cached jokes:', error);
    }
  }

  /**
   * Check if a cached joke is still fresh
   */
  private isJokeFresh(cachedJoke: CachedJoke): boolean {
    const ageHours = (Date.now() - cachedJoke.cachedAt) / (1000 * 60 * 60);
    return ageHours < this.CACHE_EXPIRY_HOURS;
  }

  /**
   * Clean up old cached jokes
   */
  async cleanupCache(): Promise<void> {
    try {
      const cachedJokes = await this.getCachedJokes();
      const freshJokes = cachedJokes.filter(c => this.isJokeFresh(c));
      
      if (freshJokes.length !== cachedJokes.length) {
        await this.saveCachedJokes(freshJokes);
        console.log(`Cleaned up ${cachedJokes.length - freshJokes.length} stale cached jokes`);
      }
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(): Promise<{
    enabled: boolean;
    lastScheduled?: string;
    cachedJokesCount: number;
    unusedJokesCount: number;
    permissions: boolean;
  }> {
    try {
      const [settings, hasPermissions, cachedJokes] = await Promise.all([
        this.getSettings(),
        this.checkPermissions(),
        this.getCachedJokes(),
      ]);

      const freshJokes = cachedJokes.filter(c => this.isJokeFresh(c));
      const unusedJokes = freshJokes.filter(c => !c.used);

      return {
        enabled: settings.enabled,
        lastScheduled: settings.lastScheduled,
        cachedJokesCount: freshJokes.length,
        unusedJokesCount: unusedJokes.length,
        permissions: hasPermissions,
      };
    } catch (error) {
      console.error('Failed to get notification stats:', error);
      return {
        enabled: false,
        cachedJokesCount: 0,
        unusedJokesCount: 0,
        permissions: false,
      };
    }
  }

  /**
   * Test notification functionality
   */
  async testNotification(): Promise<boolean> {
    try {
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        throw new Error('No notification permissions');
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18next.t('notifications.testTitle'),
          body: i18next.t('notifications.testBody'),
          data: { type: 'test' },
        },
        trigger: { seconds: 1 },
      });

      return true;
    } catch (error) {
      console.error('Failed to send test notification:', error);
      return false;
    }
  }
}

export default NotificationService;