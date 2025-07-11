import { jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SyncService from '../SyncService';
import ApiClient from '../ApiClient';
import NetworkService from '../NetworkService';
import { DatabaseService } from '../../database/DatabaseService';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../ApiClient');
jest.mock('../NetworkService');
jest.mock('../../database/DatabaseService');

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockApiClient = {
  getInstance: jest.fn(),
  submitFeedback: jest.fn(),
};
const mockNetworkService = {
  getInstance: jest.fn(),
  isConnected: jest.fn(),
  addListener: jest.fn(),
};
const mockDatabaseService = {
  getInstance: jest.fn(),
};

describe('SyncService', () => {
  let syncService: SyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    (ApiClient.getInstance as jest.Mock).mockReturnValue(mockApiClient);
    (NetworkService.getInstance as jest.Mock).mockReturnValue(mockNetworkService);
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDatabaseService);
    
    mockNetworkService.isConnected.mockReturnValue(true);
    mockNetworkService.addListener.mockReturnValue(jest.fn()); // Unsubscribe function
    
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();

    syncService = SyncService.getInstance();
  });

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      expect(NetworkService.getInstance).toHaveBeenCalled();
      expect(ApiClient.getInstance).toHaveBeenCalled();
      expect(DatabaseService.getInstance).toHaveBeenCalled();
    });

    it('should configure sync options', () => {
      syncService.configure({
        maxRetries: 5,
        retryDelay: 10000,
        batchSize: 20,
        enableAutoSync: false
      });

      // Configuration should be applied (we can't easily test this directly,
      // but we can test that the method doesn't throw)
      expect(() => syncService.configure({})).not.toThrow();
    });
  });

  describe('Sync Queue Management', () => {
    it('should add items to sync queue', async () => {
      const testData = { joke_id: 1, sentiment: 'like' };
      
      // Mock empty queue initially
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);
      
      await syncService.addToSyncQueue('feedback', testData);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'pending_sync_queue',
        expect.stringContaining(JSON.stringify(testData))
      );
    });

    it('should get pending sync count', async () => {
      const mockQueue = [
        { id: '1', type: 'feedback', data: {}, timestamp: Date.now(), attempts: 0 },
        { id: '2', type: 'feedback', data: {}, timestamp: Date.now(), attempts: 0 }
      ];
      
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockQueue));

      const count = await syncService.getPendingSyncCount();

      expect(count).toBe(2);
    });

    it('should handle empty sync queue', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const count = await syncService.getPendingSyncCount();

      expect(count).toBe(0);
    });
  });

  describe('Sync Process', () => {
    it('should sync pending data successfully', async () => {
      const mockQueue = [
        {
          id: 'test-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now(),
          attempts: 0
        }
      ];

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockQueue));
      mockApiClient.submitFeedback.mockResolvedValueOnce({ success: true });

      const result = await syncService.syncPendingData();

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockApiClient.submitFeedback).toHaveBeenCalledWith({
        joke_id: 1,
        sentiment: 'like'
      });
    });

    it('should handle sync failures', async () => {
      const mockQueue = [
        {
          id: 'test-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now(),
          attempts: 0
        }
      ];

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockQueue));
      mockApiClient.submitFeedback.mockRejectedValueOnce(new Error('API Error'));

      const result = await syncService.syncPendingData();

      expect(result.success).toBe(true); // Overall process succeeds even with individual failures
      expect(result.synced).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain('API Error');
    });

    it('should not sync when offline', async () => {
      mockNetworkService.isConnected.mockReturnValue(false);

      const result = await syncService.syncPendingData();

      expect(result.success).toBe(false);
      expect(result.errors[0].error).toBe('No connection');
      expect(mockApiClient.submitFeedback).not.toHaveBeenCalled();
    });

    it('should process sync queue in batches', async () => {
      // Create a queue larger than default batch size (10)
      const mockQueue = Array.from({ length: 15 }, (_, i) => ({
        id: `test-${i}`,
        type: 'feedback',
        data: { joke_id: i, sentiment: 'like' },
        timestamp: Date.now(),
        attempts: 0
      }));

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockQueue));
      mockApiClient.submitFeedback.mockResolvedValue({ success: true });

      // Configure smaller batch size for testing
      syncService.configure({ batchSize: 5 });

      const result = await syncService.syncPendingData();

      expect(result.synced).toBe(15);
      expect(mockApiClient.submitFeedback).toHaveBeenCalledTimes(15);
    });
  });

  describe('Network State Handling', () => {
    it('should trigger sync when network comes online', async () => {
      const mockNetworkListener = jest.fn();
      mockNetworkService.addListener.mockReturnValue(mockNetworkListener);

      // Simulate network change to connected
      const networkListener = mockNetworkService.addListener.mock.calls[0][0];
      
      // Mock empty queue for the auto-sync
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);
      
      await networkListener({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi'
      });

      // Should have attempted to sync (even with empty queue)
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('pending_sync_queue');
    });

    it('should not trigger sync when network goes offline', async () => {
      const networkListener = mockNetworkService.addListener.mock.calls[0][0];
      
      await networkListener({
        isConnected: false,
        isInternetReachable: false,
        type: 'none'
      });

      // Should not attempt to sync when offline
      expect(mockAsyncStorage.getItem).not.toHaveBeenCalledWith('pending_sync_queue');
    });
  });

  describe('Force Sync', () => {
    it('should force sync immediately', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null); // Empty queue

      const result = await syncService.forceSyncNow();

      expect(result.success).toBe(true);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('pending_sync_queue');
    });
  });

  describe('Sync Queue Cleanup', () => {
    it('should clear sync queue', async () => {
      await syncService.clearSyncQueue();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('pending_sync_queue');
    });

    it('should remove successfully synced items', async () => {
      const mockQueue = [
        {
          id: 'test-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now(),
          attempts: 0
        }
      ];

      // First call returns the queue, subsequent calls return empty queue
      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(mockQueue))
        .mockResolvedValueOnce('[]'); // Empty queue after successful removal

      mockApiClient.submitFeedback.mockResolvedValueOnce({ success: true });

      const result = await syncService.syncPendingData();

      expect(result.synced).toBe(1);
      // Should save empty queue after successful sync
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('pending_sync_queue', '[]');
    });

    it('should increment attempts for failed items', async () => {
      const mockQueue = [
        {
          id: 'test-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now(),
          attempts: 0
        }
      ];

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockQueue));
      mockApiClient.submitFeedback.mockRejectedValueOnce(new Error('API Error'));

      await syncService.syncPendingData();

      // Should update the queue with incremented attempts
      const updateCall = mockAsyncStorage.setItem.mock.calls.find(call => 
        call[0] === 'pending_sync_queue' && call[1].includes('"attempts":1')
      );
      expect(updateCall).toBeDefined();
    });
  });

  describe('Periodic Sync', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start periodic sync', () => {
      syncService.startPeriodicSync(1000); // 1 second for testing

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('should stop periodic sync', () => {
      syncService.startPeriodicSync(1000);
      syncService.stopPeriodicSync();

      expect(clearInterval).toHaveBeenCalled();
    });

    it('should sync periodically when online', () => {
      mockAsyncStorage.getItem.mockResolvedValue(null); // Empty queue
      
      syncService.startPeriodicSync(1000);

      // Fast-forward time to trigger sync
      jest.advanceTimersByTime(1000);

      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('pending_sync_queue');
    });
  });

  describe('Error Handling', () => {
    it('should handle storage errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const count = await syncService.getPendingSyncCount();

      expect(count).toBe(0); // Should return 0 on error
    });

    it('should handle malformed queue data', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce('invalid json');

      const count = await syncService.getPendingSyncCount();

      expect(count).toBe(0); // Should return 0 on parse error
    });

    it('should continue processing other items after individual failures', async () => {
      const mockQueue = [
        {
          id: 'test-1',
          type: 'feedback',
          data: { joke_id: 1, sentiment: 'like' },
          timestamp: Date.now(),
          attempts: 0
        },
        {
          id: 'test-2',
          type: 'feedback',
          data: { joke_id: 2, sentiment: 'dislike' },
          timestamp: Date.now(),
          attempts: 0
        }
      ];

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(mockQueue));
      mockApiClient.submitFeedback
        .mockRejectedValueOnce(new Error('API Error for joke 1'))
        .mockResolvedValueOnce({ success: true });

      const result = await syncService.syncPendingData();

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1);
      expect(mockApiClient.submitFeedback).toHaveBeenCalledTimes(2);
    });
  });
});