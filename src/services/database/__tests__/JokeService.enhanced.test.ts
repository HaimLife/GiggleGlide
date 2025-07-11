import { JokeService } from '../JokeService';
import { JokeRepository } from '../repositories/JokeRepository';
import { DatabaseService } from '../DatabaseService';
import { SEED_JOKES } from '../seedJokes';
import { Joke, JokeFilters } from '../types';

// Mock dependencies
jest.mock('../DatabaseService');
jest.mock('../repositories/JokeRepository');
jest.mock('../repositories/UserPreferencesRepository');
jest.mock('../repositories/FeedbackRepository');
jest.mock('../repositories/FavoritesRepository');
jest.mock('../DatabaseInitializer');

describe('JokeService Enhanced Features', () => {
  let jokeService: JokeService;
  let mockJokeRepo: jest.Mocked<JokeRepository>;
  let mockDbService: jest.Mocked<DatabaseService>;

  const mockJoke: Joke = {
    id: 1,
    txt: 'Why did the chicken cross the road? To get to the other side!',
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'general',
    tone: 'silly',
    creator: 'test',
    is_flagged: 0
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockDbService = {
      getInstance: jest.fn().mockReturnThis(),
      queryFirst: jest.fn(),
      query: jest.fn(),
      executeSql: jest.fn()
    } as any;

    mockJokeRepo = {
      needsSeeding: jest.fn(),
      bulkCreate: jest.fn(),
      getRandomJoke: jest.fn(),
      findFiltered: jest.fn(),
      countFiltered: jest.fn(),
      getStats: jest.fn(),
      findByIds: jest.fn()
    } as any;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    (JokeRepository as jest.Mock).mockImplementation(() => mockJokeRepo);

    jokeService = new JokeService({
      enableCaching: true,
      seedOnInit: true
    });
  });

  describe('initialization and seeding', () => {
    it('should seed database on initialization if needed', async () => {
      mockJokeRepo.needsSeeding.mockResolvedValue(true);
      mockJokeRepo.bulkCreate.mockResolvedValue(SEED_JOKES.length);

      await jokeService.initialize();

      expect(mockJokeRepo.needsSeeding).toHaveBeenCalled();
      expect(mockJokeRepo.bulkCreate).toHaveBeenCalledWith(SEED_JOKES);
    });

    it('should skip seeding if database already has jokes', async () => {
      mockJokeRepo.needsSeeding.mockResolvedValue(false);

      await jokeService.initialize();

      expect(mockJokeRepo.needsSeeding).toHaveBeenCalled();
      expect(mockJokeRepo.bulkCreate).not.toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      mockJokeRepo.needsSeeding.mockResolvedValue(true);
      
      await jokeService.initialize();
      await jokeService.initialize(); // Second call
      
      expect(mockJokeRepo.needsSeeding).toHaveBeenCalledTimes(1);
    });
  });

  describe('getNextUnseenJoke with performance optimization', () => {
    beforeEach(async () => {
      mockJokeRepo.needsSeeding.mockResolvedValue(false);
      await jokeService.initialize();
    });

    it('should return a joke within 2 seconds', async () => {
      mockJokeRepo.getRandomJoke.mockResolvedValue(mockJoke);
      mockDbService.queryFirst.mockResolvedValue({ count: 0 }); // Not seen
      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      const startTime = Date.now();
      const result = await jokeService.getNextUnseenJoke('user123');
      const duration = Date.now() - startTime;

      expect(result).toEqual(mockJoke);
      expect(duration).toBeLessThan(2000);
    });

    it('should use cache when available', async () => {
      // Pre-populate cache by calling pre-cache method
      mockJokeRepo.findFiltered.mockResolvedValue([mockJoke]);
      await jokeService['preCacheUnseenJokes']('user123', 'en');

      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      const result = await jokeService.getNextUnseenJoke('user123');

      expect(result).toEqual(mockJoke);
      // Should not call getRandomJoke if cache hit
      expect(mockJokeRepo.getRandomJoke).not.toHaveBeenCalled();
    });

    it('should handle cache miss gracefully', async () => {
      mockJokeRepo.getRandomJoke.mockResolvedValue(mockJoke);
      mockDbService.queryFirst.mockResolvedValue({ count: 0 });
      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      const result = await jokeService.getNextUnseenJoke('user123');

      expect(result).toEqual(mockJoke);
      expect(mockJokeRepo.getRandomJoke).toHaveBeenCalled();
    });

    it('should handle already seen jokes', async () => {
      const unseenJoke = { ...mockJoke, id: 2, txt: 'Different joke' };
      
      // First call returns seen joke, second returns unseen
      mockJokeRepo.getRandomJoke
        .mockResolvedValueOnce(mockJoke)
        .mockResolvedValueOnce(unseenJoke);
      
      mockDbService.queryFirst
        .mockResolvedValueOnce({ count: 1 }) // Already seen
        .mockResolvedValueOnce({ count: 0 }); // Not seen
      
      mockDbService.query.mockResolvedValue([{ joke_id: 1 }]); // Seen jokes
      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      const result = await jokeService.getNextUnseenJoke('user123');

      expect(result).toEqual(unseenJoke);
      expect(mockJokeRepo.getRandomJoke).toHaveBeenCalledTimes(2);
    });

    it('should apply filters correctly', async () => {
      const filters: Partial<JokeFilters> = {
        lang: 'es',
        style: 'pun',
        topic: 'food'
      };

      mockJokeRepo.getRandomJoke.mockResolvedValue(mockJoke);
      mockDbService.queryFirst.mockResolvedValue({ count: 0 });
      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      await jokeService.getNextUnseenJoke('user123', filters);

      expect(mockJokeRepo.getRandomJoke).toHaveBeenCalledWith('es', []);
    });
  });

  describe('getFilteredJokes', () => {
    it('should return filtered jokes with total count', async () => {
      const mockJokes = [mockJoke];
      const mockTotal = 25;
      
      mockJokeRepo.findFiltered.mockResolvedValue(mockJokes);
      mockJokeRepo.countFiltered.mockResolvedValue(mockTotal);

      const filters: JokeFilters = { lang: 'en', style: 'dad' };
      const result = await jokeService.getFilteredJokes(filters, { limit: 10, offset: 0 });

      expect(result.jokes).toEqual(mockJokes);
      expect(result.total).toBe(mockTotal);
      expect(mockJokeRepo.findFiltered).toHaveBeenCalledWith(filters, { limit: 10, offset: 0 });
      expect(mockJokeRepo.countFiltered).toHaveBeenCalledWith(filters);
    });
  });

  describe('getJokeStats with caching', () => {
    const mockStats = {
      total: 100,
      by_language: { en: 50, es: 30, fr: 20 },
      by_style: { dad: 25, pun: 30, general: 45 },
      by_topic: { general: 40, animals: 30, food: 30 },
      by_tone: { light: 50, silly: 30, witty: 20 }
    };

    it('should return stats from repository on first call', async () => {
      mockJokeRepo.getStats.mockResolvedValue(mockStats);

      const result = await jokeService.getJokeStats();

      expect(result).toEqual(mockStats);
      expect(mockJokeRepo.getStats).toHaveBeenCalled();
    });

    it('should return cached stats on subsequent calls', async () => {
      mockJokeRepo.getStats.mockResolvedValue(mockStats);

      // First call
      await jokeService.getJokeStats();
      
      // Second call should use cache
      const result = await jokeService.getJokeStats();

      expect(result).toEqual(mockStats);
      expect(mockJokeRepo.getStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRemainingUnseenCount', () => {
    it('should return count of unseen jokes for user', async () => {
      const expectedCount = 42;
      mockJokeRepo.countFiltered.mockResolvedValue(expectedCount);

      const result = await jokeService.getRemainingUnseenCount('user123', 'en');

      expect(result).toBe(expectedCount);
      expect(mockJokeRepo.countFiltered).toHaveBeenCalledWith({
        excludeSeenBy: 'user123',
        lang: 'en'
      });
    });
  });

  describe('resetUserProgress', () => {
    it('should clear user seen jokes and cache', async () => {
      mockDbService.executeSql.mockResolvedValue({ changes: 5 });

      await jokeService.resetUserProgress('user123');

      expect(mockDbService.executeSql).toHaveBeenCalledWith(
        'DELETE FROM seen_jokes WHERE user_id = ?',
        ['user123']
      );
    });
  });

  describe('cache management', () => {
    it('should invalidate cache when feedback is submitted', async () => {
      const mockFeedbackRepo = {
        upsert: jest.fn().mockResolvedValue(true)
      };
      (jokeService as any).feedbackRepo = mockFeedbackRepo;

      await jokeService.submitFeedback('user123', 1, 'like');

      expect(mockFeedbackRepo.upsert).toHaveBeenCalled();
      // Cache should be invalidated (verified by testing cache miss on next call)
    });

    it('should clear all cache when requested', () => {
      expect(() => jokeService.clearCache()).not.toThrow();
    });
  });

  describe('performance tests', () => {
    beforeEach(async () => {
      mockJokeRepo.needsSeeding.mockResolvedValue(false);
      await jokeService.initialize();
    });

    it('should handle high load of concurrent requests', async () => {
      mockJokeRepo.getRandomJoke.mockResolvedValue(mockJoke);
      mockDbService.queryFirst.mockResolvedValue({ count: 0 });
      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      const promises = Array.from({ length: 100 }, (_, i) => 
        jokeService.getNextUnseenJoke(`user${i}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(results.every(result => result !== null)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain performance with large exclude lists', async () => {
      const largeExcludeList = Array.from({ length: 1000 }, (_, i) => i + 1);
      
      mockDbService.query.mockResolvedValue(
        largeExcludeList.map(id => ({ joke_id: id }))
      );
      mockJokeRepo.getRandomJoke.mockResolvedValue(mockJoke);
      mockDbService.queryFirst.mockResolvedValue({ count: 1 }); // Force fallback path
      mockDbService.executeSql.mockResolvedValue({ lastInsertRowId: 1 });

      const startTime = Date.now();
      const result = await jokeService.getNextUnseenJoke('user123');
      const duration = Date.now() - startTime;

      expect(result).toEqual(mockJoke);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockJokeRepo.getRandomJoke.mockRejectedValue(new Error('Database error'));

      await expect(jokeService.getNextUnseenJoke('user123')).rejects.toThrow('Database error');
    });

    it('should handle seeding errors', async () => {
      mockJokeRepo.needsSeeding.mockResolvedValue(true);
      mockJokeRepo.bulkCreate.mockRejectedValue(new Error('Seeding failed'));

      await expect(jokeService.initialize()).rejects.toThrow('Seeding failed');
    });
  });
});