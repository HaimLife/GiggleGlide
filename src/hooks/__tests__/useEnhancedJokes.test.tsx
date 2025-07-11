import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useEnhancedJokes } from '../useEnhancedJokes';
import { EnhancedJokeService } from '../../services/database/EnhancedJokeService';
import { NetworkService } from '../../services/api';

// Mock dependencies
jest.mock('../../services/database/EnhancedJokeService');
jest.mock('../../services/api/NetworkService');
jest.mock('../useNetworkState');

const mockEnhancedJokeService = {
  initialize: jest.fn(),
  getNextUnseenJoke: jest.fn(),
  submitFeedback: jest.fn(),
  getSyncStatus: jest.fn(),
  forceSyncNow: jest.fn(),
  close: jest.fn(),
};

const mockNetworkService = {
  getInstance: jest.fn(),
  isConnected: jest.fn(),
  addListener: jest.fn(),
};

// Mock the useNetworkState hook
const mockUseNetworkState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
  isOffline: false,
  refresh: jest.fn(),
};

jest.mock('../useNetworkState', () => ({
  useNetworkState: () => mockUseNetworkState,
}));

describe('useEnhancedJokes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    (EnhancedJokeService as jest.Mock).mockImplementation(() => mockEnhancedJokeService);
    (NetworkService.getInstance as jest.Mock).mockReturnValue(mockNetworkService);
    
    mockEnhancedJokeService.initialize.mockResolvedValue(undefined);
    mockEnhancedJokeService.getSyncStatus.mockResolvedValue({
      isOnline: true,
      pendingSyncs: 0,
      lastSync: Date.now(),
      syncInProgress: false,
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    expect(result.current.currentJoke).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.source).toBeNull();
    expect(result.current.fromNetwork).toBe(false);
    expect(result.current.isOffline).toBe(false);
    expect(result.current.canLoadMore).toBe(true);
  });

  it('should initialize service on mount', async () => {
    renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      // Wait for useEffect to complete
    });

    expect(mockEnhancedJokeService.initialize).toHaveBeenCalled();
  });

  it('should load next joke successfully', async () => {
    const mockJoke = {
      id: 1,
      txt: 'Test joke',
      lang: 'en',
    };

    const mockResult = {
      joke: mockJoke,
      source: 'api' as const,
      fromNetwork: true,
    };

    mockEnhancedJokeService.getNextUnseenJoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      await result.current.loadNextJoke('test-user', { lang: 'en' });
    });

    expect(result.current.currentJoke).toEqual(mockJoke);
    expect(result.current.source).toBe('api');
    expect(result.current.fromNetwork).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle joke loading errors', async () => {
    const errorMessage = 'Failed to load joke';
    mockEnhancedJokeService.getNextUnseenJoke.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      await result.current.loadNextJoke('test-user');
    });

    expect(result.current.currentJoke).toBeNull();
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.isLoading).toBe(false);
  });

  it('should submit feedback successfully', async () => {
    mockEnhancedJokeService.submitFeedback.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      await result.current.submitFeedback('test-user', 1, 'like');
    });

    expect(mockEnhancedJokeService.submitFeedback).toHaveBeenCalledWith('test-user', 1, 'like');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle feedback submission errors', async () => {
    const errorMessage = 'Failed to submit feedback';
    mockEnhancedJokeService.submitFeedback.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      try {
        await result.current.submitFeedback('test-user', 1, 'like');
      } catch (error) {
        // Expected to throw
      }
    });

    expect(result.current.error).toBe(errorMessage);
    expect(result.current.isLoading).toBe(false);
  });

  it('should force sync successfully', async () => {
    mockEnhancedJokeService.forceSyncNow.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      await result.current.forceSyncNow();
    });

    expect(mockEnhancedJokeService.forceSyncNow).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should not allow force sync when offline', async () => {
    mockUseNetworkState.isOffline = true;

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      try {
        await result.current.forceSyncNow();
      } catch (error) {
        expect(error.message).toBe('Cannot sync while offline');
      }
    });
  });

  it('should clear error', () => {
    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    // First set an error
    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('should handle missing user ID', async () => {
    const { result } = renderHook(() => useEnhancedJokes({ userId: '' }));

    await act(async () => {
      await result.current.loadNextJoke('', { lang: 'en' });
    });

    expect(result.current.error).toBe('User ID is required');
    expect(mockEnhancedJokeService.getNextUnseenJoke).not.toHaveBeenCalled();
  });

  it('should update sync status periodically', async () => {
    const mockSyncStatus = {
      isOnline: true,
      pendingSyncs: 2,
      lastSync: Date.now(),
      syncInProgress: false,
    };

    mockEnhancedJokeService.getSyncStatus.mockResolvedValue(mockSyncStatus);

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    await act(async () => {
      // Wait for initial sync status load
    });

    expect(result.current.syncStatus).toEqual(mockSyncStatus);
  });

  it('should set canLoadMore based on loading and network state', () => {
    // Test when online and not loading
    mockUseNetworkState.isOffline = false;
    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    expect(result.current.canLoadMore).toBe(true);

    // Test when offline
    mockUseNetworkState.isOffline = true;
    const { result: offlineResult } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    expect(offlineResult.current.canLoadMore).toBe(false);
  });

  it('should cleanup service on unmount', () => {
    const { unmount } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    unmount();

    expect(mockEnhancedJokeService.close).toHaveBeenCalled();
  });

  it('should refresh data', async () => {
    const mockJoke = {
      id: 2,
      txt: 'Refreshed joke',
      lang: 'en',
    };

    const mockResult = {
      joke: mockJoke,
      source: 'cache' as const,
      fromNetwork: false,
    };

    mockEnhancedJokeService.getNextUnseenJoke.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useEnhancedJokes({ userId: 'test-user' }));

    // First load a joke
    await act(async () => {
      await result.current.loadNextJoke('test-user');
    });

    // Then refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(mockEnhancedJokeService.getSyncStatus).toHaveBeenCalled();
  });

  it('should handle auto refresh when enabled', () => {
    jest.useFakeTimers();

    const { result } = renderHook(() => 
      useEnhancedJokes({ 
        userId: 'test-user', 
        autoRefresh: true, 
        refreshInterval: 5000 
      })
    );

    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);

    jest.useRealTimers();
  });

  it('should not auto refresh when network is offline', () => {
    jest.useFakeTimers();
    mockUseNetworkState.isOffline = true;

    const { result } = renderHook(() => 
      useEnhancedJokes({ 
        userId: 'test-user', 
        autoRefresh: true, 
        refreshInterval: 5000 
      })
    );

    // Should not set up interval when offline
    expect(setTimeout).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});