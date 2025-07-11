import { usePreferencesContext } from '../contexts/PreferencesContext';
import { useCallback, useMemo } from 'react';

export const usePreferences = () => {
  const {
    preferences,
    isLoading,
    error,
    updatePreferences,
    toggleDarkMode,
    toggleSound,
    toggleHapticFeedback,
    updateJokeCategories,
    resetPreferences,
  } = usePreferencesContext();

  const darkMode = useMemo(() => {
    return preferences?.darkMode ?? false;
  }, [preferences?.darkMode]);

  const soundEnabled = useMemo(() => {
    return preferences?.soundEnabled ?? true;
  }, [preferences?.soundEnabled]);

  const hapticFeedbackEnabled = useMemo(() => {
    return preferences?.hapticFeedbackEnabled ?? true;
  }, [preferences?.hapticFeedbackEnabled]);

  const autoPlayEnabled = useMemo(() => {
    return preferences?.autoPlayEnabled ?? false;
  }, [preferences?.autoPlayEnabled]);

  const jokeCategories = useMemo(() => {
    return preferences?.jokeCategories ?? [];
  }, [preferences?.jokeCategories]);

  const setAutoPlay = useCallback(async (enabled: boolean) => {
    await updatePreferences({ autoPlayEnabled: enabled });
  }, [updatePreferences]);

  const addJokeCategory = useCallback(async (category: string) => {
    const currentCategories = preferences?.jokeCategories ?? [];
    if (!currentCategories.includes(category)) {
      await updateJokeCategories([...currentCategories, category]);
    }
  }, [preferences?.jokeCategories, updateJokeCategories]);

  const removeJokeCategory = useCallback(async (category: string) => {
    const currentCategories = preferences?.jokeCategories ?? [];
    const updatedCategories = currentCategories.filter(cat => cat !== category);
    await updateJokeCategories(updatedCategories);
  }, [preferences?.jokeCategories, updateJokeCategories]);

  const toggleJokeCategory = useCallback(async (category: string) => {
    const currentCategories = preferences?.jokeCategories ?? [];
    if (currentCategories.includes(category)) {
      await removeJokeCategory(category);
    } else {
      await addJokeCategory(category);
    }
  }, [preferences?.jokeCategories, addJokeCategory, removeJokeCategory]);

  const isCategoryEnabled = useCallback((category: string) => {
    const currentCategories = preferences?.jokeCategories ?? [];
    return currentCategories.length === 0 || currentCategories.includes(category);
  }, [preferences?.jokeCategories]);

  const getAllPreferences = useCallback(() => {
    return preferences;
  }, [preferences]);

  const exportPreferences = useCallback(() => {
    if (!preferences) return null;
    
    // Create a clean export without sensitive data
    const { id, pushToken, ...exportData } = preferences;
    return JSON.stringify(exportData, null, 2);
  }, [preferences]);

  const importPreferences = useCallback(async (jsonString: string) => {
    try {
      const imported = JSON.parse(jsonString);
      
      // Validate imported data
      const validKeys = [
        'locale',
        'darkMode',
        'notificationsEnabled',
        'notificationTime',
        'soundEnabled',
        'hapticFeedbackEnabled',
        'autoPlayEnabled',
        'jokeCategories',
      ];
      
      const validUpdates: any = {};
      for (const key of validKeys) {
        if (key in imported) {
          validUpdates[key] = imported[key];
        }
      }
      
      await updatePreferences(validUpdates);
    } catch (error) {
      console.error('Failed to import preferences:', error);
      throw new Error('Invalid preferences format');
    }
  }, [updatePreferences]);

  return {
    // State
    preferences,
    isLoading,
    error,
    
    // Individual preferences
    darkMode,
    soundEnabled,
    hapticFeedbackEnabled,
    autoPlayEnabled,
    jokeCategories,
    
    // Actions
    toggleDarkMode,
    toggleSound,
    toggleHapticFeedback,
    setAutoPlay,
    addJokeCategory,
    removeJokeCategory,
    toggleJokeCategory,
    isCategoryEnabled,
    resetPreferences,
    
    // Utilities
    getAllPreferences,
    exportPreferences,
    importPreferences,
  };
};