import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en.json';
import es from './locales/es.json';

const LANGUAGE_KEY = '@GiggleGlide:language';

// Language resources
const resources = {
  en: { translation: en },
  es: { translation: es },
};

// Get saved language or use device locale
const getInitialLanguage = async (): Promise<string> => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage && resources[savedLanguage]) {
      return savedLanguage;
    }
  } catch (error) {
    console.error('Error loading saved language:', error);
  }

  // Fall back to device locale or English
  const deviceLocale = Localization.locale.split('-')[0];
  return resources[deviceLocale] ? deviceLocale : 'en';
};

// Initialize i18n
const initI18n = async () => {
  const initialLanguage = await getInitialLanguage();

  await i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: initialLanguage,
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false, // React already escapes values
      },
      react: {
        useSuspense: false, // Disable suspense for React Native
      },
    });
};

// Save language preference
export const saveLanguagePreference = async (language: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
  } catch (error) {
    console.error('Error saving language preference:', error);
    throw error;
  }
};

// Change language and save preference
export const changeLanguage = async (language: string): Promise<void> => {
  if (!resources[language]) {
    throw new Error(`Language "${language}" is not supported`);
  }

  try {
    await i18n.changeLanguage(language);
    await saveLanguagePreference(language);
  } catch (error) {
    console.error('Error changing language:', error);
    throw error;
  }
};

// Get available languages
export const getAvailableLanguages = (): Array<{ code: string; name: string }> => [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
];

// Initialize on app start
initI18n().catch((error) => {
  console.error('Failed to initialize i18n:', error);
});

export default i18n;