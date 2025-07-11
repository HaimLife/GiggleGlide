import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppPreferences, preferencesService } from '../services/PreferencesService';

interface PreferencesContextType {
  preferences: AppPreferences | null;
  isLoading: boolean;
  error: Error | null;
  updatePreferences: (updates: Partial<AppPreferences>) => Promise<void>;
  updateLanguage: (locale: string) => Promise<void>;
  updatePushToken: (token: string | null) => Promise<void>;
  updateNotificationSettings: (settings: { enabled?: boolean; time?: string }) => Promise<void>;
  toggleDarkMode: () => Promise<void>;
  toggleSound: () => Promise<void>;
  toggleHapticFeedback: () => Promise<void>;
  updateJokeCategories: (categories: string[]) => Promise<void>;
  resetPreferences: () => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

interface PreferencesProviderProps {
  children: ReactNode;
}

export const PreferencesProvider: React.FC<PreferencesProviderProps> = ({ children }) => {
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Initialize preferences on mount
    loadPreferences();

    // Subscribe to preference changes
    const unsubscribe = preferencesService.subscribe((newPreferences) => {
      setPreferences(newPreferences);
    });

    return unsubscribe;
  }, []);

  const loadPreferences = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const prefs = await preferencesService.initialize();
      setPreferences(prefs);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to load preferences:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<AppPreferences>) => {
    try {
      setError(null);
      const updated = await preferencesService.updatePreferences(updates);
      setPreferences(updated);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const updateLanguage = async (locale: string) => {
    await updatePreferences({ locale });
  };

  const updatePushToken = async (token: string | null) => {
    await updatePreferences({ pushToken: token });
  };

  const updateNotificationSettings = async (settings: { enabled?: boolean; time?: string }) => {
    const updates: Partial<AppPreferences> = {};
    if (settings.enabled !== undefined) {
      updates.notificationsEnabled = settings.enabled;
    }
    if (settings.time !== undefined) {
      updates.notificationTime = settings.time;
    }
    await updatePreferences(updates);
  };

  const toggleDarkMode = async () => {
    const newValue = await preferencesService.toggleDarkMode();
    setPreferences(prev => prev ? { ...prev, darkMode: newValue } : null);
  };

  const toggleSound = async () => {
    const newValue = await preferencesService.toggleSound();
    setPreferences(prev => prev ? { ...prev, soundEnabled: newValue } : null);
  };

  const toggleHapticFeedback = async () => {
    const newValue = await preferencesService.toggleHapticFeedback();
    setPreferences(prev => prev ? { ...prev, hapticFeedbackEnabled: newValue } : null);
  };

  const updateJokeCategories = async (categories: string[]) => {
    await updatePreferences({ jokeCategories: categories });
  };

  const resetPreferences = async () => {
    try {
      setError(null);
      await preferencesService.reset();
      const prefs = await preferencesService.getPreferences();
      setPreferences(prefs);
    } catch (err) {
      setError(err as Error);
      throw err;
    }
  };

  const value: PreferencesContextType = {
    preferences,
    isLoading,
    error,
    updatePreferences,
    updateLanguage,
    updatePushToken,
    updateNotificationSettings,
    toggleDarkMode,
    toggleSound,
    toggleHapticFeedback,
    updateJokeCategories,
    resetPreferences,
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferencesContext = () => {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferencesContext must be used within a PreferencesProvider');
  }
  return context;
};