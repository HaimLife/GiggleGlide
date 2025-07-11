import { UserPreferencesRepository } from './database/repositories/UserPreferencesRepository';
import { UserPreferences } from './database/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppPreferences {
  id?: number;
  locale: string;
  pushToken?: string | null;
  darkMode: boolean;
  notificationsEnabled: boolean;
  notificationTime: string; // HH:MM format
  soundEnabled: boolean;
  hapticFeedbackEnabled: boolean;
  autoPlayEnabled: boolean;
  jokeCategories: string[];
}

const DEFAULT_PREFERENCES: AppPreferences = {
  locale: 'en',
  pushToken: null,
  darkMode: false,
  notificationsEnabled: true,
  notificationTime: '09:00',
  soundEnabled: true,
  hapticFeedbackEnabled: true,
  autoPlayEnabled: false,
  jokeCategories: [],
};

export class PreferencesService {
  private static instance: PreferencesService;
  private repository: UserPreferencesRepository;
  private cachedPreferences: AppPreferences | null = null;
  private listeners: Set<(preferences: AppPreferences) => void> = new Set();

  private constructor() {
    this.repository = new UserPreferencesRepository();
  }

  static getInstance(): PreferencesService {
    if (!PreferencesService.instance) {
      PreferencesService.instance = new PreferencesService();
    }
    return PreferencesService.instance;
  }

  /**
   * Initialize preferences - load from database or create defaults
   */
  async initialize(): Promise<AppPreferences> {
    try {
      // Get or create user preferences in SQLite
      const dbPreferences = await this.repository.getOrCreate({
        locale: DEFAULT_PREFERENCES.locale,
        push_token: DEFAULT_PREFERENCES.pushToken,
      });

      // Load extended preferences from AsyncStorage
      const extendedPrefs = await this.loadExtendedPreferences();

      this.cachedPreferences = {
        id: dbPreferences.id,
        locale: dbPreferences.locale || DEFAULT_PREFERENCES.locale,
        pushToken: dbPreferences.push_token,
        ...extendedPrefs,
      };

      return this.cachedPreferences;
    } catch (error) {
      console.error('Failed to initialize preferences:', error);
      this.cachedPreferences = { ...DEFAULT_PREFERENCES };
      return this.cachedPreferences;
    }
  }

  /**
   * Get current preferences
   */
  async getPreferences(): Promise<AppPreferences> {
    if (!this.cachedPreferences) {
      return await this.initialize();
    }
    return this.cachedPreferences;
  }

  /**
   * Update preferences
   */
  async updatePreferences(updates: Partial<AppPreferences>): Promise<AppPreferences> {
    try {
      const current = await this.getPreferences();
      const updated = { ...current, ...updates };

      // Update SQLite for core preferences
      if (current.id && (updates.locale !== undefined || updates.pushToken !== undefined)) {
        await this.repository.update(current.id, {
          locale: updates.locale,
          push_token: updates.pushToken,
        });
      }

      // Update AsyncStorage for extended preferences
      await this.saveExtendedPreferences(updated);

      this.cachedPreferences = updated;
      this.notifyListeners(updated);

      return updated;
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  }

  /**
   * Update language preference
   */
  async updateLanguage(locale: string): Promise<void> {
    await this.updatePreferences({ locale });
  }

  /**
   * Update push notification token
   */
  async updatePushToken(pushToken: string | null): Promise<void> {
    await this.updatePreferences({ pushToken });
  }

  /**
   * Update notification settings
   */
  async updateNotificationSettings(settings: {
    enabled?: boolean;
    time?: string;
  }): Promise<void> {
    const updates: Partial<AppPreferences> = {};
    
    if (settings.enabled !== undefined) {
      updates.notificationsEnabled = settings.enabled;
    }
    
    if (settings.time !== undefined) {
      updates.notificationTime = settings.time;
    }

    await this.updatePreferences(updates);
  }

  /**
   * Toggle dark mode
   */
  async toggleDarkMode(): Promise<boolean> {
    const current = await this.getPreferences();
    const newValue = !current.darkMode;
    await this.updatePreferences({ darkMode: newValue });
    return newValue;
  }

  /**
   * Toggle sound
   */
  async toggleSound(): Promise<boolean> {
    const current = await this.getPreferences();
    const newValue = !current.soundEnabled;
    await this.updatePreferences({ soundEnabled: newValue });
    return newValue;
  }

  /**
   * Toggle haptic feedback
   */
  async toggleHapticFeedback(): Promise<boolean> {
    const current = await this.getPreferences();
    const newValue = !current.hapticFeedbackEnabled;
    await this.updatePreferences({ hapticFeedbackEnabled: newValue });
    return newValue;
  }

  /**
   * Update joke categories
   */
  async updateJokeCategories(categories: string[]): Promise<void> {
    await this.updatePreferences({ jokeCategories: categories });
  }

  /**
   * Subscribe to preference changes
   */
  subscribe(listener: (preferences: AppPreferences) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clear all preferences and reset to defaults
   */
  async reset(): Promise<void> {
    try {
      if (this.cachedPreferences?.id) {
        await this.repository.delete(this.cachedPreferences.id);
      }
      await AsyncStorage.multiRemove([
        '@preferences:darkMode',
        '@preferences:notificationsEnabled',
        '@preferences:notificationTime',
        '@preferences:soundEnabled',
        '@preferences:hapticFeedbackEnabled',
        '@preferences:autoPlayEnabled',
        '@preferences:jokeCategories',
      ]);
      
      this.cachedPreferences = null;
      await this.initialize();
    } catch (error) {
      console.error('Failed to reset preferences:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async loadExtendedPreferences(): Promise<Omit<AppPreferences, 'id' | 'locale' | 'pushToken'>> {
    try {
      const keys = [
        '@preferences:darkMode',
        '@preferences:notificationsEnabled',
        '@preferences:notificationTime',
        '@preferences:soundEnabled',
        '@preferences:hapticFeedbackEnabled',
        '@preferences:autoPlayEnabled',
        '@preferences:jokeCategories',
      ];

      const values = await AsyncStorage.multiGet(keys);
      const prefs: any = {};

      values.forEach(([key, value]) => {
        if (value !== null) {
          const prefKey = key.split(':')[1];
          if (prefKey === 'jokeCategories') {
            prefs[prefKey] = JSON.parse(value);
          } else if (['darkMode', 'notificationsEnabled', 'soundEnabled', 'hapticFeedbackEnabled', 'autoPlayEnabled'].includes(prefKey)) {
            prefs[prefKey] = value === 'true';
          } else {
            prefs[prefKey] = value;
          }
        }
      });

      return {
        darkMode: prefs.darkMode ?? DEFAULT_PREFERENCES.darkMode,
        notificationsEnabled: prefs.notificationsEnabled ?? DEFAULT_PREFERENCES.notificationsEnabled,
        notificationTime: prefs.notificationTime ?? DEFAULT_PREFERENCES.notificationTime,
        soundEnabled: prefs.soundEnabled ?? DEFAULT_PREFERENCES.soundEnabled,
        hapticFeedbackEnabled: prefs.hapticFeedbackEnabled ?? DEFAULT_PREFERENCES.hapticFeedbackEnabled,
        autoPlayEnabled: prefs.autoPlayEnabled ?? DEFAULT_PREFERENCES.autoPlayEnabled,
        jokeCategories: prefs.jokeCategories ?? DEFAULT_PREFERENCES.jokeCategories,
      };
    } catch (error) {
      console.error('Failed to load extended preferences:', error);
      return {
        darkMode: DEFAULT_PREFERENCES.darkMode,
        notificationsEnabled: DEFAULT_PREFERENCES.notificationsEnabled,
        notificationTime: DEFAULT_PREFERENCES.notificationTime,
        soundEnabled: DEFAULT_PREFERENCES.soundEnabled,
        hapticFeedbackEnabled: DEFAULT_PREFERENCES.hapticFeedbackEnabled,
        autoPlayEnabled: DEFAULT_PREFERENCES.autoPlayEnabled,
        jokeCategories: DEFAULT_PREFERENCES.jokeCategories,
      };
    }
  }

  private async saveExtendedPreferences(preferences: AppPreferences): Promise<void> {
    try {
      const pairs: [string, string][] = [
        ['@preferences:darkMode', String(preferences.darkMode)],
        ['@preferences:notificationsEnabled', String(preferences.notificationsEnabled)],
        ['@preferences:notificationTime', preferences.notificationTime],
        ['@preferences:soundEnabled', String(preferences.soundEnabled)],
        ['@preferences:hapticFeedbackEnabled', String(preferences.hapticFeedbackEnabled)],
        ['@preferences:autoPlayEnabled', String(preferences.autoPlayEnabled)],
        ['@preferences:jokeCategories', JSON.stringify(preferences.jokeCategories)],
      ];

      await AsyncStorage.multiSet(pairs);
    } catch (error) {
      console.error('Failed to save extended preferences:', error);
      throw error;
    }
  }

  private notifyListeners(preferences: AppPreferences): void {
    this.listeners.forEach(listener => {
      try {
        listener(preferences);
      } catch (error) {
        console.error('Error in preference listener:', error);
      }
    });
  }
}

// Export singleton instance
export const preferencesService = PreferencesService.getInstance();