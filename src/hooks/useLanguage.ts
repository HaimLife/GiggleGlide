import { usePreferencesContext } from '../contexts/PreferencesContext';
import { useCallback, useMemo } from 'react';
import i18n from '../i18n/config';

export const useLanguage = () => {
  const { preferences, updateLanguage } = usePreferencesContext();

  const currentLanguage = useMemo(() => {
    return preferences?.locale || 'en';
  }, [preferences?.locale]);

  const setLanguage = useCallback(async (locale: string) => {
    try {
      // Update i18n language
      await i18n.changeLanguage(locale);
      
      // Update preferences
      await updateLanguage(locale);
    } catch (error) {
      console.error('Failed to change language:', error);
      throw error;
    }
  }, [updateLanguage]);

  const availableLanguages = useMemo(() => [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'de', name: 'German', nativeName: 'Deutsch' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
    { code: 'zh', name: 'Chinese', nativeName: '中文' },
  ], []);

  const getLanguageName = useCallback((code: string) => {
    const language = availableLanguages.find(lang => lang.code === code);
    return language?.name || code;
  }, [availableLanguages]);

  const getNativeLanguageName = useCallback((code: string) => {
    const language = availableLanguages.find(lang => lang.code === code);
    return language?.nativeName || code;
  }, [availableLanguages]);

  return {
    currentLanguage,
    setLanguage,
    availableLanguages,
    getLanguageName,
    getNativeLanguageName,
  };
};