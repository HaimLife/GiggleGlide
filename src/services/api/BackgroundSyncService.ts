import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SyncService from './SyncService';
import NetworkService from './NetworkService';
import { DatabaseService } from '../database/DatabaseService';
import { Sentiment } from '../database/types';

export interface PendingFeedback {
  id: string;
  userId: string;
  jokeId: number;
  sentiment: Sentiment;
  timestamp: number;
  synced: boolean;
  attempts: number;
}

export interface BackgroundSyncStats {
  pending: number;
  synced: number;
  failed: number;
  lastSync: number | null;
}

class BackgroundSyncService {
  private static instance: BackgroundSyncService;
  private syncService: SyncService;
  private networkService: NetworkService;
  private dbService: DatabaseService;
  private appStateSubscription?: any;
  private syncTimer?: NodeJS.Timeout;
  private isActive = false;

  private readonly PENDING_FEEDBACK_KEY = 'pending_feedback';
  private readonly BACKGROUND_SYNC_INTERVAL = 30000; // 30 seconds
  private readonly FOREGROUND_SYNC_INTERVAL = 10000; // 10 seconds

  static getInstance(): BackgroundSyncService {
    if (!BackgroundSyncService.instance) {
      BackgroundSyncService.instance = new BackgroundSyncService();
    }
    return BackgroundSyncService.instance;
  }

  private constructor() {
    this.syncService = SyncService.getInstance();
    this.networkService = NetworkService.getInstance();
    this.dbService = DatabaseService.getInstance();
    this.initialize();
  }

  private initialize(): void {
    // Listen for app state changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));
    
    // Start sync service
    this.start();
  }

  /**
   * Handle app state changes (foreground/background)
   */
  private handleAppStateChange(nextAppState: AppStateStatus): void {
    if (nextAppState === 'active') {
      console.log('App became active, starting foreground sync');
      this.startForegroundSync();
    } else if (nextAppState === 'background') {
      console.log('App went to background, starting background sync');
      this.startBackgroundSync();
    }
  }

  /**
   * Start background sync service
   */
  start(): void {
    if (this.isActive) return;
    
    this.isActive = true;
    const currentState = AppState.currentState;
    
    if (currentState === 'active') {
      this.startForegroundSync();
    } else {
      this.startBackgroundSync();
    }
    
    console.log('Background sync service started');
  }

  /**
   * Stop background sync service
   */
  stop(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
    
    console.log('Background sync service stopped');
  }

  /**
   * Start foreground sync (more frequent)
   */
  private startForegroundSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    this.scheduleSyncCheck(this.FOREGROUND_SYNC_INTERVAL);
  }

  /**
   * Start background sync (less frequent)
   */
  private startBackgroundSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    this.scheduleSyncCheck(this.BACKGROUND_SYNC_INTERVAL);
  }

  /**
   * Schedule next sync check
   */
  private scheduleSyncCheck(interval: number): void {
    if (!this.isActive) return;
    
    this.syncTimer = setTimeout(async () => {
      try {
        await this.syncPendingFeedback();
      } catch (error) {
        console.error('Error during scheduled sync:', error);
      }
      
      // Schedule next check
      this.scheduleSyncCheck(interval);
    }, interval);
  }

  /**
   * Queue feedback for background sync
   */
  async queueFeedback(userId: string, jokeId: number, sentiment: Sentiment): Promise<void> {
    try {
      const feedback: PendingFeedback = {
        id: this.generateFeedbackId(),
        userId,
        jokeId,
        sentiment,
        timestamp: Date.now(),
        synced: false,
        attempts: 0
      };

      // Store locally first
      await this.storePendingFeedback(feedback);
      
      // Add to general sync queue
      await this.syncService.addToSyncQueue('feedback', {
        joke_id: jokeId,
        sentiment: sentiment
      });

      console.log(`Queued feedback for background sync: ${feedback.id}`);
      
      // Try immediate sync if connected
      if (this.networkService.isConnected()) {
        await this.syncPendingFeedback();
      }
    } catch (error) {
      console.error('Error queueing feedback:', error);
      throw error;
    }
  }

  /**
   * Sync all pending feedback
   */
  async syncPendingFeedback(): Promise<void> {
    if (!this.networkService.isConnected()) {
      return;
    }

    try {
      const pendingFeedback = await this.getPendingFeedback();
      
      if (pendingFeedback.length === 0) {
        return;
      }

      console.log(`Syncing ${pendingFeedback.length} pending feedback items`);
      
      for (const feedback of pendingFeedback) {
        try {
          // The actual sync happens through SyncService
          // Here we just update our local tracking
          await this.markFeedbackSynced(feedback.id);
          console.log(`Marked feedback ${feedback.id} as synced`);
        } catch (error) {
          console.error(`Failed to sync feedback ${feedback.id}:`, error);
          await this.incrementFeedbackAttempts(feedback.id);
        }
      }
    } catch (error) {
      console.error('Error syncing pending feedback:', error);
    }
  }

  /**
   * Store pending feedback locally
   */
  private async storePendingFeedback(feedback: PendingFeedback): Promise<void> {
    try {
      const existing = await this.getPendingFeedback();
      existing.push(feedback);
      await AsyncStorage.setItem(this.PENDING_FEEDBACK_KEY, JSON.stringify(existing));
    } catch (error) {
      console.error('Error storing pending feedback:', error);
      throw error;
    }
  }

  /**
   * Get pending feedback
   */
  private async getPendingFeedback(): Promise<PendingFeedback[]> {
    try {
      const data = await AsyncStorage.getItem(this.PENDING_FEEDBACK_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting pending feedback:', error);
      return [];
    }
  }

  /**
   * Mark feedback as synced
   */
  private async markFeedbackSynced(id: string): Promise<void> {
    try {
      const pending = await this.getPendingFeedback();
      const feedback = pending.find(f => f.id === id);
      
      if (feedback) {
        feedback.synced = true;
        await AsyncStorage.setItem(this.PENDING_FEEDBACK_KEY, JSON.stringify(pending));
      }
    } catch (error) {
      console.error('Error marking feedback as synced:', error);
    }
  }

  /**
   * Increment feedback attempts
   */
  private async incrementFeedbackAttempts(id: string): Promise<void> {
    try {
      const pending = await this.getPendingFeedback();
      const feedback = pending.find(f => f.id === id);
      
      if (feedback) {
        feedback.attempts++;
        
        // Remove if too many attempts
        if (feedback.attempts >= 5) {
          const filtered = pending.filter(f => f.id !== id);
          await AsyncStorage.setItem(this.PENDING_FEEDBACK_KEY, JSON.stringify(filtered));
          console.log(`Removed feedback ${id} after ${feedback.attempts} failed attempts`);
        } else {
          await AsyncStorage.setItem(this.PENDING_FEEDBACK_KEY, JSON.stringify(pending));
        }
      }
    } catch (error) {
      console.error('Error incrementing feedback attempts:', error);
    }
  }

  /**
   * Clean up synced feedback
   */
  async cleanupSyncedFeedback(): Promise<void> {
    try {
      const pending = await this.getPendingFeedback();
      const unsynced = pending.filter(f => !f.synced);
      await AsyncStorage.setItem(this.PENDING_FEEDBACK_KEY, JSON.stringify(unsynced));
      console.log(`Cleaned up ${pending.length - unsynced.length} synced feedback items`);
    } catch (error) {
      console.error('Error cleaning up synced feedback:', error);
    }
  }

  /**
   * Get background sync statistics
   */
  async getStats(): Promise<BackgroundSyncStats> {
    try {
      const pending = await this.getPendingFeedback();
      const syncCount = await this.syncService.getPendingSyncCount();
      const lastSync = await this.syncService.getLastSyncTime();
      
      return {
        pending: pending.filter(f => !f.synced).length,
        synced: pending.filter(f => f.synced).length,
        failed: pending.filter(f => f.attempts >= 5).length,
        lastSync
      };
    } catch (error) {
      console.error('Error getting background sync stats:', error);
      return {
        pending: 0,
        synced: 0,
        failed: 0,
        lastSync: null
      };
    }
  }

  /**
   * Force sync all pending feedback
   */
  async forceSyncNow(): Promise<void> {
    console.log('Force syncing all pending feedback');
    await this.syncService.forceSyncNow();
    await this.syncPendingFeedback();
  }

  /**
   * Clear all pending feedback (for testing)
   */
  async clearPendingFeedback(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.PENDING_FEEDBACK_KEY);
      console.log('Cleared all pending feedback');
    } catch (error) {
      console.error('Error clearing pending feedback:', error);
    }
  }

  /**
   * Generate unique feedback ID
   */
  private generateFeedbackId(): string {
    return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = undefined;
    }
  }
}

export default BackgroundSyncService;