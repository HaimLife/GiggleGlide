import { JokeService } from '../JokeService';
import { DatabaseInitializer } from '../DatabaseInitializer';
import { JokeRepository } from '../repositories/JokeRepository';
import { UserPreferencesRepository } from '../repositories/UserPreferencesRepository';
import { FeedbackRepository } from '../repositories/FeedbackRepository';
import { FavoritesRepository } from '../repositories/FavoritesRepository';

// Mock all dependencies
jest.mock('../DatabaseInitializer');
jest.mock('../repositories/JokeRepository');
jest.mock('../repositories/UserPreferencesRepository');
jest.mock('../repositories/FeedbackRepository');
jest.mock('../repositories/FavoritesRepository');
jest.mock('../DatabaseService');

describe('JokeService', () => {
  let jokeService: JokeService;
  let mockJokeRepo: jest.Mocked<JokeRepository>;
  let mockPreferencesRepo: jest.Mocked<UserPreferencesRepository>;
  let mockFeedbackRepo: jest.Mocked<FeedbackRepository>;
  let mockFavoritesRepo: jest.Mocked<FavoritesRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockJokeRepo = {
      getRandomJoke: jest.fn().mockResolvedValue({
        id: 1,
        txt: 'Test joke',
        lang: 'en',
        created_at: new Date(),
        creator: 'test',
        is_flagged: false
      }),
      findByIds: jest.fn().mockResolvedValue([])
    } as any;

    mockPreferencesRepo = {
      getByUserId: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn()
    } as any;

    mockFeedbackRepo = {
      findByUser: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      getUserStats: jest.fn().mockResolvedValue({
        total: 0,
        liked: 0,
        disliked: 0,
        neutral: 0
      }),
      cleanupOldFeedback: jest.fn()
    } as any;

    mockFavoritesRepo = {
      toggle: jest.fn().mockResolvedValue(true),
      checkMultiple: jest.fn().mockResolvedValue([]),
      getUserFavorites: jest.fn().mockResolvedValue([])
    } as any;

    // Mock constructor implementations
    (JokeRepository as jest.Mock).mockImplementation(() => mockJokeRepo);
    (UserPreferencesRepository as jest.Mock).mockImplementation(() => mockPreferencesRepo);
    (FeedbackRepository as jest.Mock).mockImplementation(() => mockFeedbackRepo);
    (FavoritesRepository as jest.Mock).mockImplementation(() => mockFavoritesRepo);

    jokeService = new JokeService();
  });

  describe('initialize', () => {
    it('should initialize database', async () => {
      await jokeService.initialize();
      expect(DatabaseInitializer.initialize).toHaveBeenCalled();
    });
  });

  describe('getRandomJoke', () => {
    it('should get random joke with user language preference', async () => {
      mockPreferencesRepo.getByUserId.mockResolvedValue({
        id: 1,
        locale: 'es',
        push_token: null,
        created_at: new Date(),
        updated_at: new Date()
      });

      const joke = await jokeService.getRandomJoke('user123');
      
      expect(mockPreferencesRepo.getByUserId).toHaveBeenCalledWith('user123');
      expect(mockJokeRepo.getRandomJoke).toHaveBeenCalledWith('es', []);
      expect(joke).toBeDefined();
      expect(joke?.txt).toBe('Test joke');
    });

    it('should use specified language over user preference', async () => {
      await jokeService.getRandomJoke('user123', 'fr');
      
      expect(mockJokeRepo.getRandomJoke).toHaveBeenCalledWith('fr', []);
    });

    it('should exclude seen jokes', async () => {
      mockFeedbackRepo.findByUser.mockResolvedValue([
        { id: 1, user_id: 'user123', joke_id: 5, sentiment: 'like', ts: new Date() },
        { id: 2, user_id: 'user123', joke_id: 8, sentiment: 'neutral', ts: new Date() }
      ]);

      await jokeService.getRandomJoke('user123');
      
      expect(mockJokeRepo.getRandomJoke).toHaveBeenCalledWith('en', [5, 8]);
    });
  });

  describe('submitFeedback', () => {
    it('should submit feedback', async () => {
      await jokeService.submitFeedback('user123', 1, 'like');
      
      expect(mockFeedbackRepo.upsert).toHaveBeenCalledWith({
        user_id: 'user123',
        joke_id: 1,
        sentiment: 'like',
        ts: expect.any(Date)
      });
    });
  });

  describe('toggleFavorite', () => {
    it('should toggle favorite status', async () => {
      const result = await jokeService.toggleFavorite('user123', 1);
      
      expect(mockFavoritesRepo.toggle).toHaveBeenCalledWith('user123', 1);
      expect(result).toBe(true);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      mockFeedbackRepo.getUserStats.mockResolvedValue({
        total: 10,
        liked: 5,
        disliked: 2,
        neutral: 3
      });

      const stats = await jokeService.getUserStats('user123');
      
      expect(stats).toEqual({
        total_seen: 10,
        liked: 5,
        disliked: 2,
        neutral: 3,
        favorites: 0
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up old data', async () => {
      await jokeService.cleanup(30);
      
      expect(mockFeedbackRepo.cleanupOldFeedback).toHaveBeenCalledWith(30);
    });
  });
});