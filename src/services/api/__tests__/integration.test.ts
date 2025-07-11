import { jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnhancedJokeService } from '../../database/EnhancedJokeService';
import ApiClient from '../ApiClient';
import NetworkService from '../NetworkService';
import SyncService from '../SyncService';
import BackgroundSyncService from '../BackgroundSyncService';
import DeviceService from '../DeviceService';

// Mock external dependencies only
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@react-native-community/netinfo');
jest.mock('expo-device');
jest.mock('expo-constants');

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Mock fetch globally
global.fetch = jest.fn();

describe('API Integration Tests', () => {
  let enhancedJokeService: EnhancedJokeService;
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
  });

  describe('Complete Offline-to-Online Flow', () => {
    it('should handle complete user journey from offline to online', async () => {
      const userId = 'test-user-123';

      // Step 1: Start offline - should serve local joke
      const networkService = NetworkService.getInstance();
      jest.spyOn(networkService, 'isConnected').mockReturnValue(false);

      // Mock local joke available
      const localJoke = {
        id: 1,
        txt: 'Local offline joke',
        lang: 'en',
        style: 'dad' as const,
        format: 'text' as const,
        topic: 'general' as const,
        tone: 'light' as const,
      };

      // Mock database having jokes
      jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
        .mockResolvedValueOnce(localJoke);
      jest.spyOn(enhancedJokeService['dbService'], 'queryFirst')
        .mockResolvedValueOnce({ count: 0 }); // Not seen before

      const offlineResult = await enhancedJokeService.getNextUnseenJoke(userId);

      expect(offlineResult.source).toBe('database');
      expect(offlineResult.fromNetwork).toBe(false);
      expect(offlineResult.joke?.txt).toBe('Local offline joke');

      // Step 2: Submit feedback while offline - should queue for sync
      const syncService = SyncService.getInstance();
      const backgroundSyncService = BackgroundSyncService.getInstance();
      
      jest.spyOn(syncService, 'addToSyncQueue').mockResolvedValue();
      jest.spyOn(backgroundSyncService, 'queueFeedback').mockResolvedValue();

      await enhancedJokeService.submitFeedback(userId, 1, 'like');

      expect(backgroundSyncService.queueFeedback).toHaveBeenCalledWith(userId, 1, 'like');

      // Step 3: Come online - should attempt API and sync pending data
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock successful device registration
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock API joke response
      const apiJoke = {
        id: 2,
        text: 'Fresh API joke',
        language: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiJoke)),
      } as Response);

      // Mock successful feedback sync
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          success: true,
          message: 'Feedback recorded',
        })),
      } as Response);

      const onlineResult = await enhancedJokeService.getNextUnseenJoke(userId);

      expect(onlineResult.source).toBe('api');
      expect(onlineResult.fromNetwork).toBe(true);
      expect(onlineResult.joke?.txt).toBe('Fresh API joke');

      // Verify sync was attempted
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test-api.com/api/next-joke',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Sync Conflict Resolution', () => {
    it('should handle sync conflicts gracefully', async () => {
      const userId = 'conflict-user';
      const syncService = SyncService.getInstance();
      const backgroundSyncService = BackgroundSyncService.getInstance();
      const networkService = NetworkService.getInstance();

      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock pending sync queue with multiple feedbacks for same joke
      const pendingQueue = [
        {
          id: 'sync-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now() - 1000,
          attempts: 0,
        },
        {
          id: 'sync-2',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'dislike' }, // Conflicting feedback
          timestamp: Date.now(),
          attempts: 0,
        },
      ];

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'pending_sync_queue') {
          return Promise.resolve(JSON.stringify(pendingQueue));
        }
        return Promise.resolve(null);
      });

      // Mock successful authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock API accepting both feedbacks (last one wins)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        } as Response);

      const result = await syncService.syncPendingData();

      expect(result.success).toBe(true);
      expect(result.synced).toBe(2);
      expect(result.failed).toBe(0);

      // Both feedback submissions should have been attempted
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feedback'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ joke_id: 1, sentiment: 'like' }),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feedback'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ joke_id: 1, sentiment: 'dislike' }),
        })
      );
    });
  });

  describe('Network Error Recovery', () => {
    it('should recover from network failures with retry logic', async () => {
      const networkService = NetworkService.getInstance();
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock authentication success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock initial network failures followed by success
      mockFetch
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            id: 1,
            text: 'Success after retry',
            language: 'en',
            created_at: '2023-01-01T00:00:00Z',
          })),
        } as Response);

      const result = await enhancedJokeService.getNextUnseenJoke('retry-user');

      expect(result.source).toBe('api');
      expect(result.joke?.txt).toBe('Success after retry');
      
      // Should have made multiple attempts due to retry logic
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 auth + 3 joke attempts
    });

    it('should fallback to local data after all retries fail', async () => {
      const userId = 'fallback-user';
      const networkService = NetworkService.getInstance();
      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock authentication success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      // Mock all API attempts failing
      mockFetch.mockRejectedValue(new Error('Persistent network error'));

      // Mock local fallback joke
      const fallbackJoke = {
        id: 2,
        txt: 'Local fallback joke',
        lang: 'en',
        style: 'pun' as const,
        format: 'text' as const,
        topic: 'general' as const,
        tone: 'light' as const,
      };

      jest.spyOn(enhancedJokeService['jokeRepo'], 'getRandomJoke')
        .mockResolvedValueOnce(fallbackJoke);
      jest.spyOn(enhancedJokeService['dbService'], 'queryFirst')
        .mockResolvedValueOnce({ count: 0 });

      const result = await enhancedJokeService.getNextUnseenJoke(userId);

      expect(result.source).toBe('database');
      expect(result.joke?.txt).toBe('Local fallback joke');
      expect(result.error).toContain('Persistent network error');
    });
  });

  describe('Background Sync Scenarios', () => {
    it('should sync feedback in background when app becomes active', async () => {
      const backgroundSyncService = BackgroundSyncService.getInstance();
      const networkService = NetworkService.getInstance();

      jest.spyOn(networkService, 'isConnected').mockReturnValue(true);

      // Mock pending feedback
      const pendingFeedback = [
        {
          id: 'feedback-1',
          userId: 'bg-user',
          jokeId: 1,
          sentiment: 'like' as const,
          timestamp: Date.now(),
          synced: false,
          attempts: 0,
        },
      ];

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'pending_feedback') {
          return Promise.resolve(JSON.stringify(pendingFeedback));
        }
        if (key === 'pending_sync_queue') {
          return Promise.resolve(JSON.stringify([{
            id: 'sync-1',
            type: 'feedback',
            data: { joke_id: 1, sentiment: 'like' },
            timestamp: Date.now(),
            attempts: 0,
          }]));
        }
        return Promise.resolve(null);
      });

      // Mock successful authentication and feedback submission
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
            message: 'Background sync successful',
          })),
        } as Response);

      await backgroundSyncService.forceSyncNow();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/feedback'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ joke_id: 1, sentiment: 'like' }),
        })
      );
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency between local and API', async () => {
      const userId = 'consistency-user';
      const networkService = NetworkService.getInstance();

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

      // Mock API history response
      const apiHistory = {
        jokes: [
          {
            id: 1,
            text: 'Synced joke',
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(apiHistory)),
      } as Response);

      // Mock local database operations for syncing
      jest.spyOn(enhancedJokeService['jokeRepo'], 'findByIds')
        .mockResolvedValue([]); // Joke not in local cache
      jest.spyOn(enhancedJokeService['jokeRepo'], 'create')
        .mockResolvedValue(undefined);
      jest.spyOn(enhancedJokeService['feedbackRepo'], 'upsert')
        .mockResolvedValue(undefined);

      const result = await enhancedJokeService.getUserHistory(userId, 50, 0);

      expect(result.fromApi).toBe(true);
      expect(result.total).toBe(1);

      // Verify that API data was synced to local database
      expect(enhancedJokeService['jokeRepo'].create).toHaveBeenCalledWith({
        id: 1,
        txt: 'Synced joke',
        lang: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: undefined,
        style: 'general',
        format: 'text',
        topic: 'general',
        tone: 'light',
        is_flagged: 0,
      });

      expect(enhancedJokeService['feedbackRepo'].upsert).toHaveBeenCalledWith({
        user_id: userId,
        joke_id: 1,
        sentiment: 'like',
        ts: new Date('2023-01-01T01:00:00Z'),
      });
    });
  });

  describe('Authentication Flow', () => {
    it('should handle device registration and token management', async () => {
      const deviceService = DeviceService.getInstance();
      const apiClient = ApiClient.getInstance();

      // Mock device info
      jest.spyOn(deviceService, 'getDeviceInfo').mockResolvedValue({
        uuid: 'device-123',
        model: 'iPhone',
        platform: 'iOS',
        version: '15.0',
        appVersion: '1.0.0',
      });

      jest.spyOn(deviceService, 'getDeviceInfoString')
        .mockResolvedValue('iOS 15.0 - iPhone (App: 1.0.0)');

      // Mock successful registration
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          access_token: 'new-device-token',
          token_type: 'bearer',
          expires_in: 3600,
        })),
      } as Response);

      const tokenResponse = await apiClient.registerDevice();

      expect(tokenResponse.access_token).toBe('new-device-token');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register-device'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            device_uuid: 'device-123',
            device_info: 'iOS 15.0 - iPhone (App: 1.0.0)',
          }),
        })
      );

      // Verify token is stored
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'api_access_token',
        'new-device-token'
      );
    });
  });
});