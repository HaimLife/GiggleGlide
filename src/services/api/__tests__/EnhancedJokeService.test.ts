import { jest } from '@jest/globals';
import { EnhancedJokeService } from '../../database/EnhancedJokeService';
import { ApiClient, NetworkService, SyncService, BackgroundSyncService } from '../index';
import { JokeService } from '../../database/JokeService';

// Mock dependencies
jest.mock('../ApiClient');
jest.mock('../NetworkService');
jest.mock('../SyncService');
jest.mock('../BackgroundSyncService');
jest.mock('../../database/JokeService');

const mockApiClient = {
  getInstance: jest.fn(),
  getNextJoke: jest.fn(),
  submitFeedback: jest.fn(),
  getHistory: jest.fn(),
  getUserStats: jest.fn(),
  testConnection: jest.fn(),
};

const mockNetworkService = {
  getInstance: jest.fn(),
  isConnected: jest.fn(),
  addListener: jest.fn(),
};

const mockSyncService = {
  getInstance: jest.fn(),
  configure: jest.fn(),
  getPendingSyncCount: jest.fn(),
  getLastSyncTime: jest.fn(),
  forceSyncNow: jest.fn(),
  destroy: jest.fn(),
};

const mockBackgroundSyncService = {
  getInstance: jest.fn(),
  start: jest.fn(),
  queueFeedback: jest.fn(),
  forceSyncNow: jest.fn(),
  destroy: jest.fn(),
};

const mockJokeService = {
  initialize: jest.fn(),
  getNextUnseenJoke: jest.fn(),
  submitFeedback: jest.fn(),
  getUserHistory: jest.fn(),
  getUserStats: jest.fn(),
  close: jest.fn(),
  jokeRepo: {
    create: jest.fn(),
    findByIds: jest.fn(),
  },
  feedbackRepo: {
    upsert: jest.fn(),
  },
};

describe('EnhancedJokeService', () => {
  let enhancedJokeService: EnhancedJokeService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    (ApiClient.getInstance as jest.Mock).mockReturnValue(mockApiClient);
    (NetworkService.getInstance as jest.Mock).mockReturnValue(mockNetworkService);
    (SyncService.getInstance as jest.Mock).mockReturnValue(mockSyncService);
    (BackgroundSyncService.getInstance as jest.Mock).mockReturnValue(mockBackgroundSyncService);

    // Mock JokeService constructor
    (JokeService as jest.Mock).mockImplementation(() => mockJokeService);
    
    mockNetworkService.isConnected.mockReturnValue(true);
    mockSyncService.getPendingSyncCount.mockResolvedValue(0);
    mockSyncService.getLastSyncTime.mockResolvedValue(Date.now());

    enhancedJokeService = new EnhancedJokeService({
      offlineFirst: true,
      enableBackgroundSync: true,
    });
  });

  describe('Initialization', () => {
    it('should initialize all services', async () => {
      await enhancedJokeService.initialize();

      expect(mockJokeService.initialize).toHaveBeenCalled();
      expect(mockBackgroundSyncService.start).toHaveBeenCalled();
      expect(mockSyncService.configure).toHaveBeenCalledWith({
        batchSize: 10,
        enableAutoSync: true,
      });
    });

    it('should not start background sync when disabled', async () => {
      const service = new EnhancedJokeService({
        enableBackgroundSync: false,
      });

      await service.initialize();

      expect(mockBackgroundSyncService.start).not.toHaveBeenCalled();
    });
  });

  describe('Offline-First Joke Loading', () => {
    it('should serve local joke first in offline-first mode', async () => {
      const localJoke = {
        id: 1,
        txt: 'Local joke',
        lang: 'en',
      };

      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(localJoke);

      const result = await enhancedJokeService.getNextUnseenJoke('user-1', { lang: 'en' });

      expect(result.joke).toEqual(localJoke);
      expect(result.source).toBe('database');
      expect(result.fromNetwork).toBe(false);
      expect(mockJokeService.getNextUnseenJoke).toHaveBeenCalledWith('user-1', { lang: 'en' });
    });

    it('should fetch from API when no local jokes available', async () => {
      const apiJoke = {
        id: 2,
        text: 'API joke',
        language: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system',
      };

      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(null); // No local jokes
      mockApiClient.getNextJoke.mockResolvedValueOnce(apiJoke);
      mockJokeService.jokeRepo.findByIds.mockResolvedValueOnce([]); // Joke not in cache
      mockJokeService.jokeRepo.create.mockResolvedValueOnce(undefined);

      const result = await enhancedJokeService.getNextUnseenJoke('user-1', { lang: 'en' });

      expect(result.joke?.txt).toBe('API joke');
      expect(result.source).toBe('api');
      expect(result.fromNetwork).toBe(true);
      expect(mockApiClient.getNextJoke).toHaveBeenCalledWith({
        language: 'en',
        exclude_flagged: true,
      });
    });

    it('should cache API jokes locally', async () => {
      const apiJoke = {
        id: 3,
        text: 'API joke to cache',
        language: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system',
      };

      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(null);
      mockApiClient.getNextJoke.mockResolvedValueOnce(apiJoke);
      mockJokeService.jokeRepo.findByIds.mockResolvedValueOnce([]); // Not in cache
      mockJokeService.jokeRepo.create.mockResolvedValueOnce(undefined);

      await enhancedJokeService.getNextUnseenJoke('user-1');

      expect(mockJokeService.jokeRepo.create).toHaveBeenCalledWith({
        id: 3,
        txt: 'API joke to cache',
        lang: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system',
        style: 'general',
        format: 'text',
        topic: 'general',
        tone: 'light',
        is_flagged: 0,
      });
    });

    it('should handle API errors gracefully', async () => {
      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(null);
      mockApiClient.getNextJoke.mockRejectedValueOnce(new Error('API Error'));

      const fallbackJoke = {
        id: 4,
        txt: 'Fallback joke',
        lang: 'en',
      };
      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(fallbackJoke);

      const result = await enhancedJokeService.getNextUnseenJoke('user-1');

      expect(result.joke).toEqual(fallbackJoke);
      expect(result.source).toBe('database');
      expect(result.error).toBe('API Error');
    });

    it('should serve local joke when offline', async () => {
      const localJoke = {
        id: 5,
        txt: 'Offline joke',
        lang: 'en',
      };

      mockNetworkService.isConnected.mockReturnValue(false);
      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(localJoke);

      const result = await enhancedJokeService.getNextUnseenJoke('user-1');

      expect(result.joke).toEqual(localJoke);
      expect(result.source).toBe('database');
      expect(mockApiClient.getNextJoke).not.toHaveBeenCalled();
    });
  });

  describe('API-First Mode', () => {
    beforeEach(() => {
      enhancedJokeService = new EnhancedJokeService({
        offlineFirst: false,
      });
    });

    it('should try API first when not in offline-first mode', async () => {
      const apiJoke = {
        id: 6,
        text: 'API first joke',
        language: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system',
      };

      mockApiClient.getNextJoke.mockResolvedValueOnce(apiJoke);
      mockJokeService.jokeRepo.findByIds.mockResolvedValueOnce([]);
      mockJokeService.jokeRepo.create.mockResolvedValueOnce(undefined);

      const result = await enhancedJokeService.getNextUnseenJoke('user-1');

      expect(result.joke?.txt).toBe('API first joke');
      expect(result.source).toBe('api');
      expect(mockApiClient.getNextJoke).toHaveBeenCalled();
    });
  });

  describe('Feedback Handling', () => {
    it('should submit feedback locally and sync to API', async () => {
      mockJokeService.submitFeedback.mockResolvedValueOnce(undefined);
      mockApiClient.submitFeedback.mockResolvedValueOnce({ success: true });

      await enhancedJokeService.submitFeedback('user-1', 1, 'like');

      expect(mockJokeService.submitFeedback).toHaveBeenCalledWith('user-1', 1, 'like');
      expect(mockApiClient.submitFeedback).toHaveBeenCalledWith({
        joke_id: 1,
        sentiment: 'like',
      });
    });

    it('should queue feedback for background sync when API fails', async () => {
      mockJokeService.submitFeedback.mockResolvedValueOnce(undefined);
      mockApiClient.submitFeedback.mockRejectedValueOnce(new Error('API Error'));
      mockBackgroundSyncService.queueFeedback.mockResolvedValueOnce(undefined);

      await enhancedJokeService.submitFeedback('user-1', 1, 'dislike');

      expect(mockJokeService.submitFeedback).toHaveBeenCalled();
      expect(mockBackgroundSyncService.queueFeedback).toHaveBeenCalledWith('user-1', 1, 'dislike');
    });

    it('should queue feedback when offline', async () => {
      mockNetworkService.isConnected.mockReturnValue(false);
      mockJokeService.submitFeedback.mockResolvedValueOnce(undefined);
      mockBackgroundSyncService.queueFeedback.mockResolvedValueOnce(undefined);

      await enhancedJokeService.submitFeedback('user-1', 1, 'neutral');

      expect(mockJokeService.submitFeedback).toHaveBeenCalled();
      expect(mockBackgroundSyncService.queueFeedback).toHaveBeenCalled();
      expect(mockApiClient.submitFeedback).not.toHaveBeenCalled();
    });
  });

  describe('History and Stats', () => {
    it('should get history from API when online', async () => {
      const apiHistory = {
        jokes: [
          {
            id: 1,
            text: 'History joke',
            language: 'en',
            created_at: '2023-01-01T00:00:00Z',
            sentiment: 'like',
            feedback_date: '2023-01-01T01:00:00Z',
            is_favorite: false,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      };

      mockApiClient.getHistory.mockResolvedValueOnce(apiHistory);
      mockJokeService.jokeRepo.findByIds.mockResolvedValue([]);
      mockJokeService.jokeRepo.create.mockResolvedValue(undefined);
      mockJokeService.feedbackRepo.upsert.mockResolvedValue(undefined);

      const result = await enhancedJokeService.getUserHistory('user-1', 50, 0);

      expect(result.fromApi).toBe(true);
      expect(result.total).toBe(1);
      expect(mockApiClient.getHistory).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    });

    it('should fallback to local history when API fails', async () => {
      const localHistory = {
        jokes: [],
        total: 0,
      };

      mockApiClient.getHistory.mockRejectedValueOnce(new Error('API Error'));
      mockJokeService.getUserHistory.mockResolvedValueOnce(localHistory);

      const result = await enhancedJokeService.getUserHistory('user-1');

      expect(result.fromApi).toBe(false);
      expect(mockJokeService.getUserHistory).toHaveBeenCalledWith('user-1', 50, 0);
    });

    it('should get stats from API when online', async () => {
      const apiStats = {
        total_seen: 10,
        liked: 5,
        disliked: 2,
        neutral: 3,
        favorites: 1,
      };

      mockApiClient.getUserStats.mockResolvedValueOnce(apiStats);

      const result = await enhancedJokeService.getUserStats('user-1');

      expect(result.fromApi).toBe(true);
      expect(result.total_seen).toBe(10);
      expect(mockApiClient.getUserStats).toHaveBeenCalled();
    });

    it('should fallback to local stats when API fails', async () => {
      const localStats = {
        total_seen: 5,
        liked: 2,
        disliked: 1,
        neutral: 2,
        favorites: 0,
      };

      mockApiClient.getUserStats.mockRejectedValueOnce(new Error('API Error'));
      mockJokeService.getUserStats.mockResolvedValueOnce(localStats);

      const result = await enhancedJokeService.getUserStats('user-1');

      expect(result.fromApi).toBe(false);
      expect(mockJokeService.getUserStats).toHaveBeenCalledWith('user-1');
    });
  });

  describe('Sync Status', () => {
    it('should get sync status', async () => {
      mockSyncService.getPendingSyncCount.mockResolvedValueOnce(3);
      mockSyncService.getLastSyncTime.mockResolvedValueOnce(1609459200000);

      const status = await enhancedJokeService.getSyncStatus();

      expect(status.isOnline).toBe(true);
      expect(status.pendingSyncs).toBe(3);
      expect(status.lastSync).toBe(1609459200000);
    });

    it('should force sync now', async () => {
      mockSyncService.forceSyncNow.mockResolvedValueOnce({
        success: true,
        synced: 2,
        failed: 0,
        errors: [],
      });
      mockBackgroundSyncService.forceSyncNow.mockResolvedValueOnce(undefined);

      await enhancedJokeService.forceSyncNow();

      expect(mockSyncService.forceSyncNow).toHaveBeenCalled();
      expect(mockBackgroundSyncService.forceSyncNow).toHaveBeenCalled();
    });

    it('should throw error when forcing sync offline', async () => {
      mockNetworkService.isConnected.mockReturnValue(false);

      await expect(enhancedJokeService.forceSyncNow()).rejects.toThrow('No internet connection');
    });
  });

  describe('Data Conversion', () => {
    it('should convert API joke to local format', async () => {
      const apiJoke = {
        id: 7,
        text: 'Conversion test joke',
        language: 'es',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'test-creator',
      };

      mockJokeService.getNextUnseenJoke.mockResolvedValueOnce(null);
      mockApiClient.getNextJoke.mockResolvedValueOnce(apiJoke);
      mockJokeService.jokeRepo.findByIds.mockResolvedValueOnce([]);
      mockJokeService.jokeRepo.create.mockResolvedValueOnce(undefined);

      const result = await enhancedJokeService.getNextUnseenJoke('user-1');

      expect(result.joke).toEqual({
        id: 7,
        txt: 'Conversion test joke',
        lang: 'es',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'test-creator',
        style: 'general',
        format: 'text',
        topic: 'general',
        tone: 'light',
        is_flagged: 0,
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all services', async () => {
      await enhancedJokeService.close();

      expect(mockBackgroundSyncService.destroy).toHaveBeenCalled();
      expect(mockSyncService.destroy).toHaveBeenCalled();
      expect(mockJokeService.close).toHaveBeenCalled();
    });
  });
});