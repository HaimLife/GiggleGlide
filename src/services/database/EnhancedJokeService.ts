import { JokeService, JokeServiceOptions } from './JokeService';
import { ApiClient, NetworkService, SyncService, BackgroundSyncService, NetworkError, ApiRequestError } from '../api';
import { Joke, UserJokeFeedback, Sentiment, JokeFilters, PaginationOptions } from './types';
import { ApiJokeResponse } from '../api/types';

export interface EnhancedJokeServiceOptions extends JokeServiceOptions {
  apiBaseUrl?: string;
  offlineFirst?: boolean;
  enableBackgroundSync?: boolean;
  syncBatchSize?: number;
}

export interface JokeLoadResult {
  joke: Joke | null;
  source: 'api' | 'cache' | 'database';
  fromNetwork: boolean;
  error?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingSyncs: number;
  lastSync: number | null;
  syncInProgress: boolean;
}

export class EnhancedJokeService extends JokeService {
  private apiClient: ApiClient;
  private networkService: NetworkService;
  private syncService: SyncService;
  private backgroundSyncService: BackgroundSyncService;
  private enhancedOptions: EnhancedJokeServiceOptions;

  constructor(options: EnhancedJokeServiceOptions = {}) {
    super(options);
    
    this.enhancedOptions = {
      apiBaseUrl: 'http://localhost:8000',
      offlineFirst: true,
      enableBackgroundSync: true,
      syncBatchSize: 10,
      ...options
    };

    // Initialize API services
    this.apiClient = ApiClient.getInstance({
      baseUrl: this.enhancedOptions.apiBaseUrl
    });
    
    this.networkService = NetworkService.getInstance();
    this.syncService = SyncService.getInstance();
    this.backgroundSyncService = BackgroundSyncService.getInstance();

    // Configure sync service
    this.syncService.configure({
      batchSize: this.enhancedOptions.syncBatchSize,
      enableAutoSync: this.enhancedOptions.enableBackgroundSync
    });
  }

  async initialize(): Promise<void> {
    // Initialize base service first
    await super.initialize();
    
    // Start background sync if enabled
    if (this.enhancedOptions.enableBackgroundSync) {
      this.backgroundSyncService.start();
    }

    console.log('Enhanced JokeService initialized');
  }

  /**
   * Get next joke with API integration and offline-first approach
   */
  async getNextUnseenJoke(userId: string, filters?: Partial<JokeFilters>): Promise<JokeLoadResult> {
    const startTime = Date.now();
    let result: JokeLoadResult = {
      joke: null,
      source: 'database',
      fromNetwork: false
    };

    try {
      // Always try local first if offline-first is enabled
      if (this.enhancedOptions.offlineFirst) {
        const localJoke = await super.getNextUnseenJoke(userId, filters);
        if (localJoke) {
          result = {
            joke: localJoke,
            source: 'database',
            fromNetwork: false
          };
          
          console.log(`Local joke served in ${Date.now() - startTime}ms`);
          
          // Fetch fresh content in background if online
          if (this.networkService.isConnected()) {
            this.fetchAndCacheJokes(userId, filters).catch(console.error);
          }
          
          return result;
        }
      }

      // Try API if online and (no local jokes OR not offline-first)
      if (this.networkService.isConnected()) {
        try {
          const apiJoke = await this.fetchJokeFromAPI(userId, filters);
          if (apiJoke) {
            // Cache the API joke locally
            await this.cacheApiJoke(apiJoke);
            
            result = {
              joke: this.convertApiJokeToLocal(apiJoke),
              source: 'api',
              fromNetwork: true
            };
            
            console.log(`API joke served in ${Date.now() - startTime}ms`);
            return result;
          }
        } catch (error) {
          console.error('API fetch failed, falling back to local:', error);
          result.error = error instanceof Error ? error.message : 'API error';
        }
      }

      // Final fallback to local if not offline-first mode or API failed
      if (!this.enhancedOptions.offlineFirst || result.error) {
        const localJoke = await super.getNextUnseenJoke(userId, filters);
        if (localJoke) {
          result.joke = localJoke;
          result.source = 'database';
          result.fromNetwork = false;
          console.log(`Fallback local joke served in ${Date.now() - startTime}ms`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error in enhanced getNextUnseenJoke:', error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Submit feedback with sync support
   */
  async submitFeedback(userId: string, jokeId: number, sentiment: Sentiment): Promise<void> {
    try {
      // Always store locally first
      await super.submitFeedback(userId, jokeId, sentiment);
      
      // If online, try immediate API sync
      if (this.networkService.isConnected()) {
        try {
          await this.apiClient.submitFeedback({
            joke_id: jokeId,
            sentiment
          });
          console.log('Feedback synced immediately to API');
        } catch (error) {
          console.log('Immediate sync failed, queuing for background sync:', error);
          // Queue for background sync
          await this.backgroundSyncService.queueFeedback(userId, jokeId, sentiment);
        }
      } else {
        // Queue for background sync when connection is restored
        await this.backgroundSyncService.queueFeedback(userId, jokeId, sentiment);
        console.log('Feedback queued for sync when online');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  /**
   * Get user history with API sync
   */
  async getUserHistory(userId: string, limit: number = 50, offset: number = 0): Promise<{
    jokes: Array<Joke & { feedback?: UserJokeFeedback; is_favorite: boolean }>;
    total: number;
    fromApi?: boolean;
  }> {
    try {
      // Try API first if online
      if (this.networkService.isConnected()) {
        try {
          const apiHistory = await this.apiClient.getHistory({ limit, offset });
          
          // Sync API history to local database
          await this.syncHistoryToLocal(apiHistory, userId);
          
          return {
            jokes: this.convertApiHistoryToLocal(apiHistory.jokes),
            total: apiHistory.total,
            fromApi: true
          };
        } catch (error) {
          console.error('API history fetch failed, using local:', error);
        }
      }

      // Fallback to local
      const localHistory = await super.getUserHistory(userId, limit, offset);
      return {
        ...localHistory,
        fromApi: false
      };
    } catch (error) {
      console.error('Error getting user history:', error);
      throw error;
    }
  }

  /**
   * Get user stats with API sync
   */
  async getUserStats(userId: string): Promise<{
    total_seen: number;
    liked: number;
    disliked: number;
    neutral: number;
    favorites: number;
    fromApi?: boolean;
  }> {
    try {
      // Try API first if online
      if (this.networkService.isConnected()) {
        try {
          const apiStats = await this.apiClient.getUserStats();
          return {
            ...apiStats,
            fromApi: true
          };
        } catch (error) {
          console.error('API stats fetch failed, using local:', error);
        }
      }

      // Fallback to local
      const localStats = await super.getUserStats(userId);
      return {
        ...localStats,
        fromApi: false
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const pendingSyncs = await this.syncService.getPendingSyncCount();
    const lastSync = await this.syncService.getLastSyncTime();
    
    return {
      isOnline: this.networkService.isConnected(),
      pendingSyncs,
      lastSync,
      syncInProgress: false // TODO: Track this in SyncService
    };
  }

  /**
   * Force sync all pending data
   */
  async forceSyncNow(): Promise<void> {
    if (!this.networkService.isConnected()) {
      throw new NetworkError('No internet connection');
    }

    await Promise.all([
      this.syncService.forceSyncNow(),
      this.backgroundSyncService.forceSyncNow()
    ]);
  }

  /**
   * Fetch joke from API
   */
  private async fetchJokeFromAPI(userId: string, filters?: Partial<JokeFilters>): Promise<ApiJokeResponse | null> {
    try {
      return await this.apiClient.getNextJoke({
        language: filters?.lang || 'en',
        exclude_flagged: true
      });
    } catch (error) {
      if (error instanceof NetworkError || error instanceof ApiRequestError) {
        throw error;
      }
      console.error('Unexpected API error:', error);
      return null;
    }
  }

  /**
   * Cache API joke locally
   */
  private async cacheApiJoke(apiJoke: ApiJokeResponse): Promise<void> {
    try {
      const localJoke = this.convertApiJokeToLocal(apiJoke);
      // Check if joke already exists to avoid duplicates
      const existing = await this.jokeRepo.findByIds([apiJoke.id]);
      if (existing.length === 0) {
        await this.jokeRepo.create(localJoke);
        console.log(`Cached API joke ${apiJoke.id} locally`);
      }
    } catch (error) {
      console.error('Error caching API joke:', error);
    }
  }

  /**
   * Convert API joke to local format
   */
  private convertApiJokeToLocal(apiJoke: ApiJokeResponse): Joke {
    return {
      id: apiJoke.id,
      txt: apiJoke.text,
      lang: apiJoke.language,
      created_at: apiJoke.created_at,
      creator: apiJoke.creator,
      // Default values for fields not in API
      style: 'general',
      format: 'text',
      topic: 'general',
      tone: 'light',
      is_flagged: 0
    };
  }

  /**
   * Convert API history to local format
   */
  private convertApiHistoryToLocal(apiHistory: any[]): Array<Joke & { feedback?: UserJokeFeedback; is_favorite: boolean }> {
    return apiHistory.map(item => ({
      id: item.id,
      txt: item.text,
      lang: item.language,
      created_at: item.created_at,
      creator: item.creator,
      style: 'general' as const,
      format: 'text' as const,
      topic: 'general' as const,
      tone: 'light' as const,
      is_flagged: 0 as const,
      feedback: item.sentiment ? {
        user_id: '', // Will be filled by local DB
        joke_id: item.id,
        sentiment: item.sentiment,
        ts: item.feedback_date
      } : undefined,
      is_favorite: item.is_favorite || false
    }));
  }

  /**
   * Sync API history to local database
   */
  private async syncHistoryToLocal(apiHistory: any, userId: string): Promise<void> {
    try {
      // This is a simplified version - in production you'd want more sophisticated sync logic
      for (const item of apiHistory.jokes) {
        // Cache joke if not exists
        const localJoke = this.convertApiJokeToLocal(item);
        const existing = await this.jokeRepo.findByIds([item.id]);
        if (existing.length === 0) {
          await this.jokeRepo.create(localJoke);
        }

        // Sync feedback if present
        if (item.sentiment) {
          try {
            await this.feedbackRepo.upsert({
              user_id: userId,
              joke_id: item.id,
              sentiment: item.sentiment,
              ts: new Date(item.feedback_date || Date.now())
            });
          } catch (error) {
            console.error('Error syncing feedback:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error syncing history to local:', error);
    }
  }

  /**
   * Fetch and cache multiple jokes in background
   */
  private async fetchAndCacheJokes(userId: string, filters?: Partial<JokeFilters>): Promise<void> {
    try {
      // This would ideally be a batch API endpoint
      // For now, we'll just fetch one joke
      const apiJoke = await this.fetchJokeFromAPI(userId, filters);
      if (apiJoke) {
        await this.cacheApiJoke(apiJoke);
      }
    } catch (error) {
      console.error('Background joke fetch failed:', error);
    }
  }

  /**
   * Clean up and close enhanced service
   */
  async close(): Promise<void> {
    this.backgroundSyncService.destroy();
    this.syncService.destroy();
    this.networkService.destroy();
    await super.close();
  }
}

export default EnhancedJokeService;