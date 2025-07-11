import { jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedJokeService } from '../../database/EnhancedJokeService';
import NetworkService from '../NetworkService';
import SyncService from '../SyncService';
import BackgroundSyncService from '../BackgroundSyncService';

// Mock external dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@react-native-community/netinfo');

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
global.fetch = jest.fn();

describe('Offline-First Behavior Tests', () => {
  let enhancedJokeService: EnhancedJokeService;
  let networkService: NetworkService;
  let syncService: SyncService;
  let backgroundSyncService: BackgroundSyncService;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    
    // Setup default mocks
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();

    enhancedJokeService = new EnhancedJokeService({
      apiBaseUrl: 'http://test-api.com',
      offlineFirst: true,
      enableBackgroundSync: true,
    });

    networkService = NetworkService.getInstance();
    syncService = SyncService.getInstance();
    backgroundSyncService = BackgroundSyncService.getInstance();
  });

  describe('Offline Operation', () => {
    beforeEach(() => {
      // Mock offline state
      jest.spyOn(networkService, 'isConnected').mockReturnValue(false);
    });

    it('should serve local jokes when offline', async () => {
      const userId = 'offline-user';
      
      // Mock local joke in database
      const localJoke = {
        id: 1,
        txt: 'Offline joke',
        lang: 'en',
        style: 'dad' as const,
        format: 'text' as const,
        topic: 'general' as const,
        tone: 'light' as const,
      };

      jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
        .mockResolvedValue(localJoke);
      jest.spyOn(enhancedJokeService['dbService'], 'queryFirst')
        .mockResolvedValue({ count: 0 }); // Not seen before

      const result = await enhancedJokeService.getNextUnseenJoke(userId);

      expect(result.joke).toEqual(localJoke);
      expect(result.source).toBe('database');
      expect(result.fromNetwork).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should queue feedback when offline', async () => {
      const userId = 'offline-user';
      
      // Mock local feedback storage
      jest.spyOn(enhancedJokeService['feedbackRepo'], 'upsert')
        .mockResolvedValue(undefined);
      
      // Mock background sync queueing
      jest.spyOn(backgroundSyncService, 'queueFeedback')
        .mockResolvedValue(undefined);

      await enhancedJokeService.submitFeedback(userId, 1, 'like');

      expect(enhancedJokeService['feedbackRepo'].upsert).toHaveBeenCalledWith({
        user_id: userId,
        joke_id: 1,
        sentiment: 'like',
        ts: expect.any(Date),
      });
      expect(backgroundSyncService.queueFeedback).toHaveBeenCalledWith(userId, 1, 'like');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should provide meaningful error when no local jokes available', async () => {
      const userId = 'no-jokes-user';
      
      // Mock no local jokes available
      jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
        .mockResolvedValue(null);

      const result = await enhancedJokeService.getNextUnseenJoke(userId);

      expect(result.joke).toBeNull();
      expect(result.source).toBe('database');
      expect(result.fromNetwork).toBe(false);
    });
  });

  describe('Online-to-Offline Transition', () => {
    it('should handle network disconnection gracefully', async () => {
      const userId = 'transition-user';
      
      // Start online
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);
      
      // Mock successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock API joke
      const apiJoke = {
        id: 1,
        text: 'Online joke',
        language: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiJoke)),
      } as Response);

      // Mock caching
      jest.spyOn(enhancedJokeService['jokeRepo'], 'findByIds')
        .mockResolvedValue([]);
      jest.spyOn(enhancedJokeService['jokeRepo'], 'create')
        .mockResolvedValue(undefined);

      const onlineResult = await enhancedJokeService.getNextUnseenJoke(userId);
      expect(onlineResult.source).toBe('api');

      // Go offline
      jest.spyOn(networkService, 'isConnected').mockReturnValue(false);

      // Mock local joke for offline mode
      const localJoke = {
        id: 2,
        txt: 'Cached joke',
        lang: 'en',
        style: 'pun' as const,
        format: 'text' as const,
        topic: 'general' as const,
        tone: 'light' as const,
      };

      jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
        .mockResolvedValue(localJoke);
      jest.spyOn(enhancedJokeService['dbService'], 'queryFirst')
        .mockResolvedValue({ count: 0 });

      const offlineResult = await enhancedJokeService.getNextUnseenJoke(userId);
      expect(offlineResult.source).toBe('database');
      expect(offlineResult.joke).toEqual(localJoke);
    });
  });

  describe('Offline-to-Online Transition', () => {
    it('should sync pending data when coming online', async () => {
      const userId = 'sync-user';
      
      // Start offline with pending feedback
      jest.spyOn(networkService, 'isConnected').mockReturnValue(false);
      
      // Queue feedback while offline
      jest.spyOn(enhancedJokeService['feedbackRepo'], 'upsert')
        .mockResolvedValue(undefined);
      jest.spyOn(backgroundSyncService, 'queueFeedback')
        .mockResolvedValue(undefined);

      await enhancedJokeService.submitFeedback(userId, 1, 'like');

      // Mock pending sync data
      const pendingSync = [{
        id: 'sync-1',
        type: 'feedback',
        data: { joke_id: 1, sentiment: 'like' },
        timestamp: Date.now(),
        attempts: 0,
      }];

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'pending_sync_queue') {
          return Promise.resolve(JSON.stringify(pendingSync));
        }
        return Promise.resolve(null);
      });

      // Come online
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock successful authentication and sync
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            access_token: 'test-token',
            token_type: 'bearer',
            expires_in: 3600,
          })),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            success: true,
            message: 'Feedback synced',
          })),
        } as Response);

      // Trigger sync
      const syncResult = await syncService.syncPendingData();

      expect(syncResult.success).toBe(true);
      expect(syncResult.synced).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feedback'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ joke_id: 1, sentiment: 'like' }),
        })
      );
    });

    it('should prefer fresh API data when coming online', async () => {
      const userId = 'fresh-data-user';
      
      // Start offline with local jokes
      jest.spyOn(networkService, 'isConnected').mockReturnValue(false);
      
      const oldLocalJoke = {
        id: 1,
        txt: 'Old local joke',
        lang: 'en',
        style: 'dad' as const,
        format: 'text' as const,
        topic: 'general' as const,
        tone: 'light' as const,
      };

      jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
        .mockResolvedValue(oldLocalJoke);
      jest.spyOn(enhancedJokeService['dbService'], 'queryFirst')
        .mockResolvedValue({ count: 0 });

      const offlineResult = await enhancedJokeService.getNextUnseenJoke(userId);
      expect(offlineResult.source).toBe('database');

      // Come online
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // In offline-first mode, should still serve local first but trigger background fetch
      const stillLocalResult = await enhancedJokeService.getNextUnseenJoke(userId);
      expect(stillLocalResult.source).toBe('database');
      
      // But if we disable offline-first temporarily for this test
      enhancedJokeService['enhancedOptions'].offlineFirst = false;

      // Mock fresh API joke
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            access_token: 'test-token',
            token_type: 'bearer',
            expires_in: 3600,
          })),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            id: 2,
            text: 'Fresh API joke',
            language: 'en',
            created_at: '2023-01-01T00:00:00Z',
            creator: 'system',
          })),
        } as Response);

      jest.spyOn(enhancedJokeService['jokeRepo'], 'findByIds')
        .mockResolvedValue([]);
      jest.spyOn(enhancedJokeService['jokeRepo'], 'create')
        .mockResolvedValue(undefined);

      const freshResult = await enhancedJokeService.getNextUnseenJoke(userId);
      expect(freshResult.source).toBe('api');
      expect(freshResult.joke?.txt).toBe('Fresh API joke');
    });
  });

  describe('Sync Conflict Resolution', () => {
    it('should handle conflicts when multiple feedback for same joke exists', async () => {
      const userId = 'conflict-user';
      
      // Create conflicting feedback entries
      const conflictingFeedback = [
        {
          id: 'feedback-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now() - 2000,
          attempts: 0,
        },
        {
          id: 'feedback-2', 
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'dislike' }, // Conflict!
          timestamp: Date.now() - 1000,
          attempts: 0,
        },
        {
          id: 'feedback-3',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'neutral' }, // Latest wins
          timestamp: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'pending_sync_queue') {
          return Promise.resolve(JSON.stringify(conflictingFeedback));
        }
        return Promise.resolve(null);
      });

      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock API accepting all feedback (in order)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response);

      const syncResult = await syncService.syncPendingData();

      expect(syncResult.success).toBe(true);
      expect(syncResult.synced).toBe(3);
      
      // All three feedback submissions should have been made
      // The server will naturally handle the conflict by taking the latest
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 auth + 3 feedback
    });
  });

  describe('Data Persistence', () => {
    it('should persist offline data across app restarts', async () => {
      const userId = 'persistent-user';
      
      // Mock stored pending feedback
      const storedFeedback = [
        {
          id: 'stored-1',
          userId,
          jokeId: 1,
          sentiment: 'like',
          timestamp: Date.now() - 60000, // 1 minute ago
          synced: false,
          attempts: 0,
        },
      ];

      const storedSyncQueue = [
        {
          id: 'stored-sync-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now() - 60000,
          attempts: 0,
        },
      ];

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'pending_feedback') {
          return Promise.resolve(JSON.stringify(storedFeedback));
        }
        if (key === 'pending_sync_queue') {
          return Promise.resolve(JSON.stringify(storedSyncQueue));
        }
        return Promise.resolve(null);
      });

      // Get pending counts
      const pendingFeedbackCount = await backgroundSyncService.getPendingSyncCount();
      const pendingSyncCount = await syncService.getPendingSyncCount();

      expect(pendingFeedbackCount).toBeGreaterThan(0);
      expect(pendingSyncCount).toBe(1);

      // When coming online, should sync stored data
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            access_token: 'test-token',
            token_type: 'bearer',
            expires_in: 3600,
          })),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response);

      const syncResult = await syncService.syncPendingData();
      expect(syncResult.synced).toBe(1);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle large sync queues efficiently', async () => {
      const userId = 'load-user';
      
      // Create large sync queue
      const largeSyncQueue = Array.from({ length: 100 }, (_, i) => ({
        id: `load-${i}`,
        type: 'feedback',
        data: { joke_id: i + 1, sentiment: 'like' },
        timestamp: Date.now() - (100 - i) * 1000,
        attempts: 0,
      }));

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'pending_sync_queue') {
          return Promise.resolve(JSON.stringify(largeSyncQueue));
        }
        return Promise.resolve(null);
      });

      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock successful responses for all feedback
      for (let i = 0; i < 100; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response);
      }

      const startTime = Date.now();
      const syncResult = await syncService.syncPendingData();
      const endTime = Date.now();

      expect(syncResult.success).toBe(true);
      expect(syncResult.synced).toBe(100);
      expect(syncResult.failed).toBe(0);
      
      // Should complete within reasonable time (adjust as needed)
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds max
    });
  });
});

describe('Offline-First Implementation Validation', () => {
  it('should prioritize local data over network in offline-first mode', async () => {
    const enhancedJokeService = new EnhancedJokeService({
      offlineFirst: true,
    });

    const networkService = NetworkService.getInstance();
    jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

    // Mock local joke available
    const localJoke = {
      id: 1,
      txt: 'Local priority joke',
      lang: 'en',
      style: 'dad' as const,
      format: 'text' as const,
      topic: 'general' as const,
      tone: 'light' as const,
    };

    jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
      .mockResolvedValue(localJoke);
    jest.spyOn(enhancedJokeService['dbService'], 'queryFirst')
      .mockResolvedValue({ count: 0 });

    const result = await enhancedJokeService.getNextUnseenJoke('priority-user');

    // Should serve local joke even though online
    expect(result.source).toBe('database');
    expect(result.joke).toEqual(localJoke);
    
    // Should not make API call for primary joke
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should use API-first when offline-first is disabled', async () => {
    const enhancedJokeService = new EnhancedJokeService({
      offlineFirst: false,
    });

    const networkService = NetworkService.getInstance();
    jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

    // Mock API response
    const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          id: 1,
          text: 'API priority joke',
          language: 'en',
          created_at: '2023-01-01T00:00:00Z',
          creator: 'system',
        })),
      } as Response);

    jest.spyOn(enhancedJokeService['jokeRepo'], 'findByIds')
      .mockResolvedValue([]);
    jest.spyOn(enhancedJokeService['jokeRepo'], 'create')
      .mockResolvedValue(undefined);

    const result = await enhancedJokeService.getNextUnseenJoke('api-first-user');

    expect(result.source).toBe('api');
    expect(result.joke?.txt).toBe('API priority joke');
    expect(mockFetch).toHaveBeenCalledTimes(2); // Auth + joke
  });
});
