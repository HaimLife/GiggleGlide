import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadLanguageCache,
  saveLanguageToCache,
  clearLanguageCache,
  getLanguageCacheStats,
} from '../languageCache';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('languageCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
  });

  describe('loadLanguageCache', () => {
    it('returns empty array when no cache exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await loadLanguageCache();

      expect(result).toEqual([]);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@GiggleGlide:languageCache');
    });

    it('returns cached languages sorted by frequency and recency', async () => {
      const mockCache = [
        { code: 'es', lastUsed: 1000, useCount: 5 },
        { code: 'fr', lastUsed: 2000, useCount: 3 },
        { code: 'en', lastUsed: 1500, useCount: 5 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockCache));

      const result = await loadLanguageCache();

      // Should be sorted by useCount desc, then lastUsed desc
      expect(result).toEqual(['en', 'es', 'fr']);
    });

    it('limits results to max cached languages', async () => {
      const mockCache = [
        { code: 'es', lastUsed: 1000, useCount: 5 },
        { code: 'fr', lastUsed: 2000, useCount: 4 },
        { code: 'de', lastUsed: 1500, useCount: 3 },
        { code: 'it', lastUsed: 900, useCount: 2 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockCache));

      const result = await loadLanguageCache();

      expect(result).toHaveLength(3); // MAX_CACHED_LANGUAGES
      expect(result).toEqual(['es', 'fr', 'de']);
    });

    it('handles invalid JSON gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');

      const result = await loadLanguageCache();

      expect(result).toEqual([]);
    });

    it('handles AsyncStorage errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await loadLanguageCache();

      expect(result).toEqual([]);
    });
  });

  describe('saveLanguageToCache', () => {
    it('creates new cache entry for new language', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      const mockDate = 1609459200000; // Fixed timestamp
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);

      await saveLanguageToCache('es');

      const expectedCache = [
        { code: 'es', lastUsed: mockDate, useCount: 1 },
      ];
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:languageCache',
        JSON.stringify(expectedCache)
      );
    });

    it('updates existing language entry', async () => {
      const existingCache = [
        { code: 'es', lastUsed: 1000, useCount: 2 },
        { code: 'fr', lastUsed: 2000, useCount: 1 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingCache));
      const mockDate = 1609459200000;
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);

      await saveLanguageToCache('es');

      const expectedCache = [
        { code: 'es', lastUsed: mockDate, useCount: 3 },
        { code: 'fr', lastUsed: 2000, useCount: 1 },
      ];
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@GiggleGlide:languageCache',
        JSON.stringify(expectedCache)
      );
    });

    it('limits cache to max languages', async () => {
      const existingCache = [
        { code: 'es', lastUsed: 1000, useCount: 3 },
        { code: 'fr', lastUsed: 2000, useCount: 2 },
        { code: 'de', lastUsed: 1500, useCount: 1 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingCache));
      const mockDate = 1609459200000;
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);

      await saveLanguageToCache('it');

      const savedCache = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1]
      );
      
      expect(savedCache).toHaveLength(3);
      expect(savedCache.map((item: any) => item.code)).toContain('it');
      expect(savedCache.map((item: any) => item.code)).not.toContain('de'); // Should remove least used
    });

    it('handles AsyncStorage errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(saveLanguageToCache('es')).resolves.toBeUndefined();
    });

    it('handles setItem errors gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(saveLanguageToCache('es')).resolves.toBeUndefined();
    });
  });

  describe('clearLanguageCache', () => {
    it('removes cache from storage', async () => {
      await clearLanguageCache();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
        '@GiggleGlide:languageCache'
      );
    });

    it('handles errors gracefully', async () => {
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(clearLanguageCache()).resolves.toBeUndefined();
    });
  });

  describe('getLanguageCacheStats', () => {
    it('returns cache stats', async () => {
      const mockCache = [
        { code: 'es', lastUsed: 1000, useCount: 5 },
        { code: 'fr', lastUsed: 2000, useCount: 3 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockCache));

      const result = await getLanguageCacheStats();

      expect(result).toEqual(mockCache);
    });

    it('returns empty array when no cache exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await getLanguageCacheStats();

      expect(result).toEqual([]);
    });

    it('handles errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await getLanguageCacheStats();

      expect(result).toEqual([]);
    });
  });

  describe('cache behavior edge cases', () => {
    it('sorts by recency when use counts are equal', async () => {
      const existingCache = [
        { code: 'es', lastUsed: 1000, useCount: 2 },
        { code: 'fr', lastUsed: 2000, useCount: 2 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(existingCache));

      const result = await loadLanguageCache();

      expect(result).toEqual(['fr', 'es']); // fr is more recent
    });

    it('handles corrupted cache data', async () => {
      const corruptedCache = [
        { code: 'es' }, // Missing required fields
        { lastUsed: 1000, useCount: 2 }, // Missing code
        { code: 'fr', lastUsed: 2000, useCount: 2 },
      ];
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(corruptedCache));

      const result = await loadLanguageCache();

      // Should handle corrupted entries gracefully
      expect(result).toContain('fr');
    });
  });
});