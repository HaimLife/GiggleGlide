import { useTranslation as useTranslationBase } from 'react-i18next';
import { TFunction } from 'i18next';

interface UseTranslationReturn {
  t: TFunction;
  i18n: {
    language: string;
    changeLanguage: (lng: string) => Promise<TFunction>;
    dir: (lng?: string) => 'ltr' | 'rtl';
    exists: (key: string, options?: any) => boolean;
  };
  ready: boolean;
}

/**
 * Custom hook for translations with TypeScript support
 * Wraps react-i18next's useTranslation with better typing
 */
export const useTranslation = (namespace?: string): UseTranslationReturn => {
  const { t, i18n, ready } = useTranslationBase(namespace);

  return {
    t,
    i18n: {
      language: i18n.language,
      changeLanguage: i18n.changeLanguage.bind(i18n),
      dir: i18n.dir.bind(i18n),
      exists: i18n.exists.bind(i18n),
    },
    ready,
  };
};

/**
 * Helper function to format translations with parameters
 */
export const formatTranslation = (
  t: TFunction,
  key: string,
  params?: Record<string, any>
): string => {
  return t(key, params);
};

/**
 * Helper function to get plural translations
 */
export const getPluralTranslation = (
  t: TFunction,
  key: string,
  count: number,
  params?: Record<string, any>
): string => {
  return t(key, { count, ...params });
};

/**
 * Helper function to check if a translation key exists
 */
export const translationExists = (
  i18n: UseTranslationReturn['i18n'],
  key: string
): boolean => {
  return i18n.exists(key);
};