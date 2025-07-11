import { useState, useEffect, useCallback } from 'react';
import { SyncService, BackgroundSyncService } from '../services/api';
import { SyncResult } from '../services/api/SyncService';
import { BackgroundSyncStats } from '../services/api/BackgroundSyncService';
import { useNetworkState } from './useNetworkState';

export interface UseSyncStatusState {
  pendingSyncs: number;
  lastSync: number | null;
  syncInProgress: boolean;
  backgroundStats: BackgroundSyncStats | null;
  lastSyncResult: SyncResult | null;
  error: string | null;
}

export interface UseSyncStatusActions {
  forceSyncNow: () => Promise<SyncResult>;
  clearPendingSync: () => Promise<void>;
  refresh: () => Promise<void>;
}

export interface UseSyncStatusResult extends UseSyncStatusState, UseSyncStatusActions {
  isOnline: boolean;
  canSync: boolean;
  hasPendingChanges: boolean;
}

export const useSyncStatus = (options: {
  autoRefresh?: boolean;
  refreshInterval?: number;
} = {}): UseSyncStatusResult => {
  const { autoRefresh = true, refreshInterval = 15000 } = options;
  const networkState = useNetworkState();
  
  const [state, setState] = useState<UseSyncStatusState>({
    pendingSyncs: 0,
    lastSync: null,
    syncInProgress: false,
    backgroundStats: null,
    lastSyncResult: null,
    error: null
  });

  const [syncService] = useState(() => SyncService.getInstance());
  const [backgroundSyncService] = useState(() => BackgroundSyncService.getInstance());

  const loadSyncStatus = useCallback(async () => {
    try {
      const [
        pendingSyncs,
        lastSync,
        backgroundStats
      ] = await Promise.all([
        syncService.getPendingSyncCount(),
        syncService.getLastSyncTime(),
        backgroundSyncService.getStats()
      ]);

      setState(prev => ({
        ...prev,
        pendingSyncs,
        lastSync,
        backgroundStats,
        error: null
      }));
    } catch (error) {
      console.error('Error loading sync status:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load sync status'
      }));
    }
  }, [syncService, backgroundSyncService]);

  // Load initial status
  useEffect(() => {
    loadSyncStatus();
  }, [loadSyncStatus]);

  // Auto refresh
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadSyncStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, loadSyncStatus]);

  // Refresh when network comes back online
  useEffect(() => {
    if (networkState.isConnected && !networkState.isOffline) {
      loadSyncStatus();
    }
  }, [networkState.isConnected, networkState.isOffline, loadSyncStatus]);

  const forceSyncNow = useCallback(async (): Promise<SyncResult> => {
    if (!networkState.isConnected) {
      throw new Error('Cannot sync while offline');
    }

    setState(prev => ({ ...prev, syncInProgress: true, error: null }));

    try {
      const result = await syncService.forceSyncNow();
      
      // Also trigger background sync
      await backgroundSyncService.forceSyncNow();
      
      setState(prev => ({
        ...prev,
        syncInProgress: false,
        lastSyncResult: result
      }));

      // Refresh status after sync
      await loadSyncStatus();

      return result;
    } catch (error) {
      console.error('Error during force sync:', error);
      setState(prev => ({
        ...prev,
        syncInProgress: false,
        error: error instanceof Error ? error.message : 'Sync failed',
        lastSyncResult: {
          success: false,
          synced: 0,
          failed: 0,
          errors: [{ id: 'force_sync', error: 'Sync failed' }]
        }
      }));
      throw error;
    }
  }, [syncService, backgroundSyncService, networkState.isConnected, loadSyncStatus]);

  const clearPendingSync = useCallback(async (): Promise<void> => {
    try {
      await Promise.all([
        syncService.clearSyncQueue(),
        backgroundSyncService.clearPendingFeedback()
      ]);
      
      await loadSyncStatus();
    } catch (error) {
      console.error('Error clearing pending sync:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to clear pending sync'
      }));
      throw error;
    }
  }, [syncService, backgroundSyncService, loadSyncStatus]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadSyncStatus();
  }, [loadSyncStatus]);

  return {
    // State
    ...state,
    isOnline: networkState.isConnected && !networkState.isOffline,
    canSync: networkState.isConnected && !networkState.isOffline && !state.syncInProgress,
    hasPendingChanges: state.pendingSyncs > 0 || (state.backgroundStats?.pending || 0) > 0,
    
    // Actions
    forceSyncNow,
    clearPendingSync,
    refresh
  };
};