import { DatabaseInitializer } from './DatabaseInitializer';
import { JokeRepository } from './repositories/JokeRepository';
import { UserPreferencesRepository } from './repositories/UserPreferencesRepository';
import { FeedbackRepository } from './repositories/FeedbackRepository';
import { FavoritesRepository } from './repositories/FavoritesRepository';
import { Joke, UserJokeFeedback, Sentiment } from './types';
import { DatabaseService } from './DatabaseService';

export interface JokeServiceOptions {
  defaultLanguage?: string;
  maxHistorySize?: number;
}

export class JokeService {
  private jokeRepo: JokeRepository;
  private preferencesRepo: UserPreferencesRepository;
  private feedbackRepo: FeedbackRepository;
  private favoritesRepo: FavoritesRepository;
  private dbService: DatabaseService;
  private options: JokeServiceOptions;

  constructor(options: JokeServiceOptions = {}) {
    this.dbService = DatabaseService.getInstance();
    this.jokeRepo = new JokeRepository();
    this.preferencesRepo = new UserPreferencesRepository();
    this.feedbackRepo = new FeedbackRepository();
    this.favoritesRepo = new FavoritesRepository();
    this.options = {
      defaultLanguage: 'en',
      maxHistorySize: 1000,
      ...options
    };
  }

  async initialize(): Promise<void> {
    await DatabaseInitializer.initialize();
  }

  async getRandomJoke(userId: string, language?: string): Promise<Joke | null> {
    try {
      // Get user preferences if language not specified
      if (!language) {
        const prefs = await this.preferencesRepo.getByUserId(userId);
        language = prefs?.locale || this.options.defaultLanguage;
      }

      // Get seen joke IDs to exclude
      const seenJokes = await this.feedbackRepo.findByUser(userId);
      const seenJokeIds = seenJokes.map(f => f.joke_id);

      // Get a random joke excluding seen ones
      const joke = await this.jokeRepo.getRandomJoke(language, seenJokeIds);
      
      if (joke) {
        // Mark as seen
        await this.recordJokeSeen(userId, joke.id);
      }

      return joke;
    } catch (error) {
      console.error('Error getting random joke:', error);
      throw error;
    }
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

  async close(): Promise<void> {
    await DatabaseInitializer.close();
  }
}