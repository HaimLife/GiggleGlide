import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiClient from './ApiClient';
import NetworkService, { NetworkState } from './NetworkService';
import { DatabaseService } from '../database/DatabaseService';
import { ApiFeedbackRequest, ApiJokeResponse } from './types';

export interface PendingSync {
  id: string;
  type: 'feedback' | 'seen_joke';
  data: any;
  timestamp: number;
  attempts: number;
  lastAttempt?: number;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export interface SyncOptions {
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
  enableAutoSync: boolean;
}

class SyncService {
  private static instance: SyncService;
  private apiClient: ApiClient;
  private networkService: NetworkService;
  private dbService: DatabaseService;
  private isRunning = false;
  private syncInterval?: NodeJS.Timeout;
  private networkUnsubscribe?: () => void;
  
  private readonly PENDING_SYNC_KEY = 'pending_sync_queue';
  private readonly LAST_SYNC_KEY = 'last_sync_timestamp';
  
  private options: SyncOptions = {
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    batchSize: 10,
    enableAutoSync: true
  };

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  private constructor() {
    this.apiClient = ApiClient.getInstance();
    this.networkService = NetworkService.getInstance();
    this.dbService = DatabaseService.getInstance();
    this.initialize();
  }

  private initialize(): void {
    // Listen for network changes and sync when connected
    if (this.options.enableAutoSync) {
      this.networkUnsubscribe = this.networkService.addListener(this.handleNetworkChange.bind(this));
    }
  }

  /**
   * Configure sync service
   */
  configure(options: Partial<SyncOptions>): void {
    this.options = { ...this.options, ...options };
    
    if (this.options.enableAutoSync && !this.networkUnsubscribe) {
      this.networkUnsubscribe = this.networkService.addListener(this.handleNetworkChange.bind(this));
    } else if (!this.options.enableAutoSync && this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = undefined;
    }
  }

  /**
   * Handle network state changes
   */
  private async handleNetworkChange(state: NetworkState): Promise<void> {
    if (state.isConnected && state.isInternetReachable !== false) {
      console.log('Network connected, starting background sync...');
      await this.syncPendingData();
    }
  }

  /**
   * Add item to sync queue
   */
  async addToSyncQueue(type: 'feedback' | 'seen_joke', data: any): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const syncItem: PendingSync = {
        id: this.generateSyncId(),
        type,
        data,
        timestamp: Date.now(),
        attempts: 0
      };

      queue.push(syncItem);
      await this.saveSyncQueue(queue);
      
      console.log(`Added ${type} to sync queue:`, syncItem.id);
      
      // Try immediate sync if connected
      if (this.networkService.isConnected()) {
        this.syncPendingData().catch(console.error);
      }
    } catch (error) {
      console.error('Error adding to sync queue:', error);
    }
  }

  /**
   * Sync all pending data
   */
  async syncPendingData(): Promise<SyncResult> {
    if (this.isRunning) {
      console.log('Sync already running, skipping...');
      return { success: true, synced: 0, failed: 0, errors: [] };
    }

    if (!this.networkService.isConnected()) {
      console.log('No network connection, skipping sync');
      return { success: false, synced: 0, failed: 0, errors: [{ id: 'network', error: 'No connection' }] };
    }

    this.isRunning = true;
    console.log('Starting sync process...');

    try {
      const queue = await this.getSyncQueue();
      const result: SyncResult = {
        success: true,
        synced: 0,
        failed: 0,
        errors: []
      };

      if (queue.length === 0) {
        console.log('No pending sync items');
        return result;
      }

      // Process in batches
      const batches = this.chunkArray(queue, this.options.batchSize);
      
      for (const batch of batches) {
        const batchResults = await Promise.allSettled(
          batch.map(item => this.syncItem(item))
        );

        for (let i = 0; i < batchResults.length; i++) {
          const batchResult = batchResults[i];
          const item = batch[i];

          if (batchResult.status === 'fulfilled' && batchResult.value) {
            result.synced++;
            // Remove from queue
            await this.removeFromSyncQueue(item.id);
          } else {
            result.failed++;
            const error = batchResult.status === 'rejected' ? batchResult.reason : 'Unknown error';
            result.errors.push({ id: item.id, error: error.message || error });
            
            // Update attempts and retry if under limit
            await this.updateSyncItemAttempts(item.id);
          }
        }
      }

      await this.updateLastSyncTime();
      console.log(`Sync completed: ${result.synced} synced, ${result.failed} failed`);
      
      return result;
    } catch (error) {
      console.error('Error during sync:', error);
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: [{ id: 'sync', error: error.message || 'Unknown sync error' }]
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sync individual item
   */
  private async syncItem(item: PendingSync): Promise<boolean> {
    try {
      console.log(`Syncing ${item.type}:`, item.id);
      
      switch (item.type) {
        case 'feedback':
          await this.apiClient.submitFeedback(item.data as ApiFeedbackRequest);
          break;
        case 'seen_joke':
          // For seen jokes, we might not need to sync to API if it's handled differently
          // This depends on your backend implementation
          break;
        default:
          throw new Error(`Unknown sync type: ${item.type}`);
      }
      
      console.log(`Successfully synced ${item.type}:`, item.id);
      return true;
    } catch (error) {
      console.error(`Failed to sync ${item.type} ${item.id}:`, error);
      throw error;
    }
  }

  /**
   * Get sync queue from storage
   */
  private async getSyncQueue(): Promise<PendingSync[]> {
    try {
      const queueData = await AsyncStorage.getItem(this.PENDING_SYNC_KEY);
      return queueData ? JSON.parse(queueData) : [];
    } catch (error) {
      console.error('Error getting sync queue:', error);
      return [];
    }
  }

  /**
   * Save sync queue to storage
   */
  private async saveSyncQueue(queue: PendingSync[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving sync queue:', error);
    }
  }

  /**
   * Remove item from sync queue
   */
  private async removeFromSyncQueue(id: string): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const filteredQueue = queue.filter(item => item.id !== id);
      await this.saveSyncQueue(filteredQueue);
    } catch (error) {
      console.error('Error removing from sync queue:', error);
    }
  }

  /**
   * Update sync item attempts
   */
  private async updateSyncItemAttempts(id: string): Promise<void> {
    try {
      const queue = await this.getSyncQueue();
      const item = queue.find(item => item.id === id);
      
      if (item) {
        item.attempts++;
        item.lastAttempt = Date.now();
        
        // Remove if exceeded max retries
        if (item.attempts >= this.options.maxRetries) {
          console.log(`Removing sync item ${id} after ${item.attempts} failed attempts`);
          await this.removeFromSyncQueue(id);
        } else {
          await this.saveSyncQueue(queue);
        }
      }
    } catch (error) {
      console.error('Error updating sync item attempts:', error);
    }
  }

  /**
   * Get pending sync count
   */
  async getPendingSyncCount(): Promise<number> {
    const queue = await this.getSyncQueue();
    return queue.length;
  }

  /**
   * Get last sync time
   */
  async getLastSyncTime(): Promise<number | null> {
    try {
      const timestamp = await AsyncStorage.getItem(this.LAST_SYNC_KEY);
      return timestamp ? parseInt(timestamp, 10) : null;
    } catch (error) {
      console.error('Error getting last sync time:', error);
      return null;
    }
  }

  /**
   * Update last sync time
   */
  private async updateLastSyncTime(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.LAST_SYNC_KEY, Date.now().toString());
    } catch (error) {
      console.error('Error updating last sync time:', error);
    }
  }

  /**
   * Clear all pending sync data
   */
  async clearSyncQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.PENDING_SYNC_KEY);
      console.log('Sync queue cleared');
    } catch (error) {
      console.error('Error clearing sync queue:', error);
    }
  }

  /**
   * Force sync now (manual trigger)
   */
  async forceSyncNow(): Promise<SyncResult> {
    console.log('Force sync triggered');
    return this.syncPendingData();
  }

  /**
   * Start periodic sync
   */
  startPeriodicSync(intervalMs: number = 300000): void { // 5 minutes default
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      if (this.networkService.isConnected()) {
        this.syncPendingData().catch(console.error);
      }
    }, intervalMs);
    
    console.log(`Started periodic sync every ${intervalMs}ms`);
  }

  /**
   * Stop periodic sync
   */
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
      console.log('Stopped periodic sync');
    }
  }

  /**
   * Utility: Generate unique sync ID
   */
  private generateSyncId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility: Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPeriodicSync();
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = undefined;
    }
  }
}

export default SyncService;