import { useState, useCallback, useEffect } from 'react';
import { EnhancedJokeService, JokeLoadResult, SyncStatus } from '../services/database/EnhancedJokeService';
import { Joke, Sentiment, JokeFilters } from '../services/database/types';
import { useNetworkState } from './useNetworkState';

export interface UseEnhancedJokesState {
  currentJoke: Joke | null;
  isLoading: boolean;
  error: string | null;
  source: 'api' | 'cache' | 'database' | null;
  fromNetwork: boolean;
  syncStatus: SyncStatus | null;
}

export interface UseEnhancedJokesActions {
  loadNextJoke: (userId: string, filters?: Partial<JokeFilters>) => Promise<void>;
  submitFeedback: (userId: string, jokeId: number, sentiment: Sentiment) => Promise<void>;
  forceSyncNow: () => Promise<void>;
  clearError: () => void;
  refresh: () => Promise<void>;
}

export interface UseEnhancedJokesResult extends UseEnhancedJokesState, UseEnhancedJokesActions {
  isOffline: boolean;
  canLoadMore: boolean;
}

export const useEnhancedJokes = (options: {
  userId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
} = { userId: '' }): UseEnhancedJokesResult => {
  const { userId, autoRefresh = false, refreshInterval = 30000 } = options;
  const networkState = useNetworkState();
  
  const [state, setState] = useState<UseEnhancedJokesState>({
    currentJoke: null,
    isLoading: false,
    error: null,
    source: null,
    fromNetwork: false,
    syncStatus: null
  });

  const [jokeService] = useState(() => new EnhancedJokeService({
    enableCaching: true,
    enableBackgroundSync: true,
    offlineFirst: true
  }));

  // Initialize service
  useEffect(() => {
    jokeService.initialize().catch(console.error);
    return () => {
      jokeService.close().catch(console.error);
    };
  }, [jokeService]);

  // Load sync status
  useEffect(() => {
    const loadSyncStatus = async () => {
      try {
        const syncStatus = await jokeService.getSyncStatus();
        setState(prev => ({ ...prev, syncStatus }));
      } catch (error) {
        console.error('Error loading sync status:', error);
      }
    };

    loadSyncStatus();
    
    // Update sync status periodically
    const interval = setInterval(loadSyncStatus, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [jokeService]);

  // Auto refresh when online
  useEffect(() => {
    if (autoRefresh && networkState.isConnected && !networkState.isOffline) {
      const interval = setInterval(() => {
        loadSyncStatus();
      }, refreshInterval);
      
      return () => clearInterval(interval);
    }
  }, [autoRefresh, networkState.isConnected, networkState.isOffline, refreshInterval]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const syncStatus = await jokeService.getSyncStatus();
      setState(prev => ({ ...prev, syncStatus }));
    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  }, [jokeService]);

  const loadNextJoke = useCallback(async (
    userIdParam: string, 
    filters?: Partial<JokeFilters>
  ): Promise<void> => {
    if (!userIdParam) {
      setState(prev => ({ ...prev, error: 'User ID is required' }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null 
    }));

    try {
      const result: JokeLoadResult = await jokeService.getNextUnseenJoke(userIdParam, filters);
      
      setState(prev => ({
        ...prev,
        currentJoke: result.joke,
        isLoading: false,
        source: result.source,
        fromNetwork: result.fromNetwork,
        error: result.error || null
      }));

      // Update sync status after loading
      await loadSyncStatus();
    } catch (error) {
      console.error('Error loading next joke:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load joke',
        currentJoke: null,
        source: null,
        fromNetwork: false
      }));
    }
  }, [jokeService, loadSyncStatus]);

  const submitFeedback = useCallback(async (
    userIdParam: string, 
    jokeId: number, 
    sentiment: Sentiment
  ): Promise<void> => {
    if (!userIdParam) {
      throw new Error('User ID is required');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await jokeService.submitFeedback(userIdParam, jokeId, sentiment);
      
      // Update sync status after feedback
      await loadSyncStatus();
      
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Error submitting feedback:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit feedback';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, [jokeService, loadSyncStatus]);

  const forceSyncNow = useCallback(async (): Promise<void> => {
    if (networkState.isOffline) {
      throw new Error('Cannot sync while offline');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await jokeService.forceSyncNow();
      await loadSyncStatus();
      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Error forcing sync:', error);
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }, [jokeService, loadSyncStatus, networkState.isOffline]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await loadSyncStatus();
    if (userId && state.currentJoke) {
      await loadNextJoke(userId);
    }
  }, [loadSyncStatus, userId, state.currentJoke, loadNextJoke]);

  return {
    // State
    ...state,
    isOffline: networkState.isOffline,
    canLoadMore: !state.isLoading && !networkState.isOffline,
    
    // Actions
    loadNextJoke,
    submitFeedback,
    forceSyncNow,
    clearError,
    refresh
  };
};