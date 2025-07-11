import { DatabaseInitializer } from './DatabaseInitializer';
import { JokeRepository } from './repositories/JokeRepository';
import { UserPreferencesRepository } from './repositories/UserPreferencesRepository';
import { FeedbackRepository } from './repositories/FeedbackRepository';
import { FavoritesRepository } from './repositories/FavoritesRepository';
import { Joke, UserJokeFeedback, Sentiment, JokeFilters } from './types';
import { DatabaseService } from './DatabaseService';
import { SEED_JOKES } from './seedJokes';

export interface JokeServiceOptions {
  defaultLanguage?: string;
  maxHistorySize?: number;
  enableCaching?: boolean;
  seedOnInit?: boolean;
}

interface CachedJoke {
  joke: Joke;
  timestamp: number;
}

// Cache for frequently accessed data
class JokeCache {
  private unseenCache = new Map<string, CachedJoke[]>();
  private statsCache: any = null;
  private statsCacheTime = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly STATS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  setUnseen(userId: string, jokes: Joke[]): void {
    this.unseenCache.set(userId, jokes.map(joke => ({
      joke,
      timestamp: Date.now()
    })));
  }

  getUnseen(userId: string): Joke[] | null {
    const cached = this.unseenCache.get(userId);
    if (!cached) return null;
    
    const now = Date.now();
    const valid = cached.filter(item => now - item.timestamp < this.CACHE_TTL);
    
    if (valid.length === 0) {
      this.unseenCache.delete(userId);
      return null;
    }
    
    return valid.map(item => item.joke);
  }

  invalidateUser(userId: string): void {
    this.unseenCache.delete(userId);
  }

  setStats(stats: any): void {
    this.statsCache = stats;
    this.statsCacheTime = Date.now();
  }

  getStats(): any | null {
    if (!this.statsCache) return null;
    if (Date.now() - this.statsCacheTime > this.STATS_CACHE_TTL) {
      this.statsCache = null;
      return null;
    }
    return this.statsCache;
  }

  clear(): void {
    this.unseenCache.clear();
    this.statsCache = null;
    this.statsCacheTime = 0;
  }
}

export class JokeService {
  private jokeRepo: JokeRepository;
  private preferencesRepo: UserPreferencesRepository;
  private feedbackRepo: FeedbackRepository;
  private favoritesRepo: FavoritesRepository;
  private dbService: DatabaseService;
  private options: JokeServiceOptions;
  private cache: JokeCache;
  private initialized = false;

  constructor(options: JokeServiceOptions = {}) {
    this.dbService = DatabaseService.getInstance();
    this.jokeRepo = new JokeRepository();
    this.preferencesRepo = new UserPreferencesRepository();
    this.feedbackRepo = new FeedbackRepository();
    this.favoritesRepo = new FavoritesRepository();
    this.cache = new JokeCache();
    this.options = {
      defaultLanguage: 'en',
      maxHistorySize: 1000,
      enableCaching: true,
      seedOnInit: true,
      ...options
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await DatabaseInitializer.initialize();
    
    // Seed jokes if needed and option is enabled
    if (this.options.seedOnInit && await this.jokeRepo.needsSeeding()) {
      console.log('Seeding jokes database...');
      await this.seedJokes();
      console.log(`Seeded ${SEED_JOKES.length} jokes successfully`);
    }
    
    this.initialized = true;
  }

  /**
   * Seed the database with initial jokes
   */
  async seedJokes(): Promise<void> {
    try {
      await this.jokeRepo.bulkCreate(SEED_JOKES);
    } catch (error) {
      console.error('Error seeding jokes:', error);
      throw error;
    }
  }

  /**
   * Get next unseen joke for user - optimized for <2s latency
   */
  async getNextUnseenJoke(userId: string, filters?: Partial<JokeFilters>): Promise<Joke | null> {
    const startTime = Date.now();
    
    try {
      // Ensure initialized
      if (!this.initialized) {
        await this.initialize();
      }

      // Get user preferences if language not specified
      const language = filters?.lang || await this.getUserLanguage(userId);
      
      // Try cache first if enabled
      if (this.options.enableCaching) {
        const cachedJokes = this.cache.getUnseen(userId);
        if (cachedJokes && cachedJokes.length > 0) {
          const joke = cachedJokes.find(j => !filters || this.matchesFilters(j, filters));
          if (joke) {
            await this.recordJokeSeen(userId, joke.id!);
            this.cache.invalidateUser(userId); // Invalidate cache after use
            console.log(`Cache hit: ${Date.now() - startTime}ms`);
            return joke;
          }
        }
      }

      // Get a random unseen joke using optimized query
      const joke = await this.jokeRepo.getRandomJoke(language, []);
      
      if (joke) {
        // Check if already seen (fast indexed lookup)
        const alreadySeen = await this.dbService.queryFirst<{ count: number }>(
          `SELECT COUNT(*) as count FROM seen_jokes WHERE user_id = ? AND joke_id = ?`,
          [userId, joke.id]
        );
        
        if (!alreadySeen || alreadySeen.count === 0) {
          // Mark as seen
          await this.recordJokeSeen(userId, joke.id!);
          
          // Pre-cache more jokes for this user if caching enabled
          if (this.options.enableCaching) {
            this.preCacheUnseenJokes(userId, language).catch(console.error);
          }
          
          const duration = Date.now() - startTime;
          console.log(`Joke fetched in ${duration}ms`);
          return joke;
        } else {
          // If this joke was already seen, try again with excluding seen jokes
          return this.getRandomUnseenJoke(userId, language);
        }
      }

      // No more unseen jokes
      return null;
    } catch (error) {
      console.error('Error getting next unseen joke:', error);
      throw error;
    }
  }

  /**
   * Fallback method for getting unseen jokes with exclusion
   */
  private async getRandomUnseenJoke(userId: string, language?: string): Promise<Joke | null> {
    // Get seen joke IDs (limit to recent ones for performance)
    const seenResult = await this.dbService.query<{ joke_id: number }>(
      `SELECT joke_id FROM seen_jokes WHERE user_id = ? ORDER BY ts DESC LIMIT 1000`,
      [userId]
    );
    const seenJokeIds = seenResult.map(r => r.joke_id);

    // Get random joke excluding seen ones
    return await this.jokeRepo.getRandomJoke(language, seenJokeIds);
  }

  /**
   * Pre-cache unseen jokes for better performance
   */
  private async preCacheUnseenJokes(userId: string, language?: string): Promise<void> {
    try {
      const filters: JokeFilters = {
        excludeSeenBy: userId,
        lang: language
      };
      
      const unseenJokes = await this.jokeRepo.findFiltered(filters, { limit: 10 });
      this.cache.setUnseen(userId, unseenJokes);
    } catch (error) {
      console.error('Error pre-caching jokes:', error);
    }
  }

  /**
   * Legacy method - now points to optimized version
   */
  async getRandomJoke(userId: string, language?: string): Promise<Joke | null> {
    return this.getNextUnseenJoke(userId, { lang: language });
  }

  /**
   * Get user's preferred language
   */
  private async getUserLanguage(userId: string): Promise<string> {
    try {
      const prefs = await this.preferencesRepo.getByUserId(userId);
      return prefs?.locale || this.options.defaultLanguage || 'en';
    } catch {
      return this.options.defaultLanguage || 'en';
    }
  }

  /**
   * Check if joke matches filters
   */
  private matchesFilters(joke: Joke, filters: Partial<JokeFilters>): boolean {
    if (filters.lang && joke.lang !== filters.lang) return false;
    if (filters.style && joke.style !== filters.style) return false;
    if (filters.format && joke.format !== filters.format) return false;
    if (filters.topic && joke.topic !== filters.topic) return false;
    if (filters.tone && joke.tone !== filters.tone) return false;
    return true;
  }

  async recordJokeSeen(userId: string, jokeId: number): Promise<void> {
    try {
      // Record in seen_jokes table
      await this.dbService.executeSql(
        `INSERT OR IGNORE INTO seen_jokes (user_id, joke_id) VALUES (?, ?)`,
        [userId, jokeId]
      );
    } catch (error) {
      console.error('Error recording joke seen:', error);
      // Non-critical error, don't throw
    }
  }

  async submitFeedback(userId: string, jokeId: number, sentiment: Sentiment): Promise<void> {
    try {
      await this.feedbackRepo.upsert({
        user_id: userId,
        joke_id: jokeId,
        sentiment,
        ts: new Date()
      });
      
      // Invalidate cache for this user since feedback affects recommendations
      if (this.options.enableCaching) {
        this.cache.invalidateUser(userId);
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }

  async toggleFavorite(userId: string, jokeId: number): Promise<boolean> {
    try {
      return await this.favoritesRepo.toggle(userId, jokeId);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  }

  async getUserHistory(userId: string, limit: number = 50, offset: number = 0): Promise<{
    jokes: Array<Joke & { feedback?: UserJokeFeedback; is_favorite: boolean }>;
    total: number;
  }> {
    try {
      // Get user's feedback history
      const feedbacks = await this.feedbackRepo.findByUser(userId, limit, offset);
      const jokeIds = feedbacks.map(f => f.joke_id);
      
      if (jokeIds.length === 0) {
        return { jokes: [], total: 0 };
      }

      // Get jokes
      const jokes = await this.jokeRepo.findByIds(jokeIds);
      const jokeMap = new Map(jokes.map(j => [j.id, j]));

      // Check favorites
      const favorites = await this.favoritesRepo.checkMultiple(userId, jokeIds);

      // Combine data
      const history = feedbacks
        .map(feedback => {
          const joke = jokeMap.get(feedback.joke_id);
          if (!joke) return null;

          return {
            ...joke,
            feedback,
            is_favorite: favorites.includes(feedback.joke_id)
          };
        })
        .filter(Boolean) as Array<Joke & { feedback?: UserJokeFeedback; is_favorite: boolean }>;

      // Get total count
      const totalResult = await this.dbService.queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM user_joke_feedback WHERE user_id = ?`,
        [userId]
      );

      return {
        jokes: history,
        total: totalResult?.count || 0
      };
    } catch (error) {
      console.error('Error getting user history:', error);
      throw error;
    }
  }

  async getUserFavorites(userId: string): Promise<Joke[]> {
    try {
      return await this.favoritesRepo.getUserFavorites(userId);
    } catch (error) {
      console.error('Error getting user favorites:', error);
      throw error;
    }
  }

  async getUserStats(userId: string): Promise<{
    total_seen: number;
    liked: number;
    disliked: number;
    neutral: number;
    favorites: number;
  }> {
    try {
      const stats = await this.feedbackRepo.getUserStats(userId);
      const favoritesResult = await this.dbService.queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM favorites WHERE user_id = ?`,
        [userId]
      );

      return {
        total_seen: stats.total,
        liked: stats.liked,
        disliked: stats.disliked,
        neutral: stats.neutral,
        favorites: favoritesResult?.count || 0
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  async updateUserPreferences(userId: string, locale?: string, pushToken?: string): Promise<void> {
    try {
      const existing = await this.preferencesRepo.getByUserId(userId);
      
      if (existing) {
        await this.preferencesRepo.update(existing.id, { locale, push_token: pushToken });
      } else {
        await this.preferencesRepo.create({
          locale: locale || this.options.defaultLanguage,
          push_token: pushToken || null
        });
      }
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  async cleanup(olderThanDays: number = 365): Promise<void> {
    try {
      // Clean up old feedback
      await this.feedbackRepo.cleanupOldFeedback(olderThanDays);
      
      // Clean up orphaned seen jokes
      await this.dbService.executeSql(
        `DELETE FROM seen_jokes WHERE ts < datetime('now', '-' || ? || ' days')`,
        [olderThanDays]
      );
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }

  /**
   * Get filtered jokes with advanced filtering
   */
  async getFilteredJokes(filters: JokeFilters, options: PaginationOptions = {}): Promise<{
    jokes: Joke[];
    total: number;
  }> {
    try {
      const [jokes, total] = await Promise.all([
        this.jokeRepo.findFiltered(filters, options),
        this.jokeRepo.countFiltered(filters)
      ]);

      return { jokes, total };
    } catch (error) {
      console.error('Error getting filtered jokes:', error);
      throw error;
    }
  }

  /**
   * Get joke statistics
   */
  async getJokeStats(): Promise<{
    total: number;
    by_language: { [key: string]: number };
    by_style: { [key: string]: number };
    by_topic: { [key: string]: number };
    by_tone: { [key: string]: number };
  }> {
    try {
      // Try cache first
      if (this.options.enableCaching) {
        const cached = this.cache.getStats();
        if (cached) return cached;
      }

      const stats = await this.jokeRepo.getStats();
      
      // Cache the result
      if (this.options.enableCaching) {
        this.cache.setStats(stats);
      }

      return stats;
    } catch (error) {
      console.error('Error getting joke stats:', error);
      throw error;
    }
  }

  /**
   * Reset user's seen jokes (for testing or user request)
   */
  async resetUserProgress(userId: string): Promise<void> {
    try {
      await this.dbService.executeSql(
        `DELETE FROM seen_jokes WHERE user_id = ?`,
        [userId]
      );
      
      // Clear cache for this user
      if (this.options.enableCaching) {
        this.cache.invalidateUser(userId);
      }
    } catch (error) {
      console.error('Error resetting user progress:', error);
      throw error;
    }
  }

  /**
   * Get remaining unseen jokes count for user
   */
  async getRemainingUnseenCount(userId: string, language?: string): Promise<number> {
    try {
      const filters: JokeFilters = {
        excludeSeenBy: userId,
        lang: language || await this.getUserLanguage(userId)
      };
      
      return await this.jokeRepo.countFiltered(filters);
    } catch (error) {
      console.error('Error getting remaining unseen count:', error);
      throw error;
    }
  }

  /**
   * Clear cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.cache.clear();
  }

  async close(): Promise<void> {
    this.clearCache();
    await DatabaseInitializer.close();
  }
}