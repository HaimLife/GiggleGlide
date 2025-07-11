import AsyncStorage from '@react-native-async-storage/async-storage';

const LANGUAGE_CACHE_KEY = '@GiggleGlide:languageCache';
const MAX_CACHED_LANGUAGES = 3;

interface LanguageCacheItem {
  code: string;
  lastUsed: number;
  useCount: number;
}

/**
 * Loads the cached frequently used languages
 * @returns Array of language codes sorted by frequency and recency
 */
export const loadLanguageCache = async (): Promise<string[]> => {
  try {
    const cacheData = await AsyncStorage.getItem(LANGUAGE_CACHE_KEY);
    if (!cacheData) {
      return [];
    }

    const cache: LanguageCacheItem[] = JSON.parse(cacheData);
    
    // Sort by use count (descending) and then by last used (descending)
    const sortedCache = cache.sort((a, b) => {
      if (a.useCount !== b.useCount) {
        return b.useCount - a.useCount;
      }
      return b.lastUsed - a.lastUsed;
    });

    return sortedCache.slice(0, MAX_CACHED_LANGUAGES).map(item => item.code);
  } catch (error) {
    console.error('Error loading language cache:', error);
    return [];
  }
};

/**
 * Saves a language to the cache, updating its usage count and last used time
 * @param languageCode The language code to cache
 */
export const saveLanguageToCache = async (languageCode: string): Promise<void> => {
  try {
    const cacheData = await AsyncStorage.getItem(LANGUAGE_CACHE_KEY);
    let cache: LanguageCacheItem[] = [];

    if (cacheData) {
      cache = JSON.parse(cacheData);
    }

    // Find existing item or create new one
    const existingIndex = cache.findIndex(item => item.code === languageCode);
    const now = Date.now();

    if (existingIndex >= 0) {
      // Update existing item
      cache[existingIndex].lastUsed = now;
      cache[existingIndex].useCount += 1;
    } else {
      // Add new item
      cache.push({
        code: languageCode,
        lastUsed: now,
        useCount: 1,
      });
    }

    // Sort by use count and recency, then limit to max
    cache.sort((a, b) => {
      if (a.useCount !== b.useCount) {
        return b.useCount - a.useCount;
      }
      return b.lastUsed - a.lastUsed;
    });

    // Keep only the most frequently used languages
    if (cache.length > MAX_CACHED_LANGUAGES) {
      cache = cache.slice(0, MAX_CACHED_LANGUAGES);
    }

    await AsyncStorage.setItem(LANGUAGE_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Error saving language to cache:', error);
    // Don't throw error as this is not critical functionality
  }
};

/**
 * Clears the language cache
 */
export const clearLanguageCache = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LANGUAGE_CACHE_KEY);
  } catch (error) {
    console.error('Error clearing language cache:', error);
  }
};

/**
 * Gets the cache statistics for debugging
 */
export const getLanguageCacheStats = async (): Promise<LanguageCacheItem[]> => {
  try {
    const cacheData = await AsyncStorage.getItem(LANGUAGE_CACHE_KEY);
    if (!cacheData) {
      return [];
    }
    return JSON.parse(cacheData);
  } catch (error) {
    console.error('Error getting language cache stats:', error);
    return [];
  }
};