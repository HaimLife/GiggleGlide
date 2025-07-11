import { BaseRepository } from './BaseRepository';
import { TABLES } from '../config';
import { UserJokeFeedback, PaginationOptions } from '../types';

export class FeedbackRepository extends BaseRepository {
  constructor() {
    super(TABLES.USER_JOKE_FEEDBACK);
  }

  /**
   * Create new feedback
   */
  async create(feedback: Omit<UserJokeFeedback, 'id' | 'ts'>): Promise<number> {
    const { user_id, joke_id, sentiment } = feedback;
    
    const result = await this.executeSql(
      `INSERT INTO ${this.tableName} (user_id, joke_id, sentiment) VALUES (?, ?, ?)`,
      [user_id, joke_id, sentiment]
    );
    
    return result.lastInsertRowId;
  }

  /**
   * Get feedback by ID
   */
  async findById(id: number): Promise<UserJokeFeedback | null> {
    return await this.queryFirst<UserJokeFeedback>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
  }

  /**
   * Get feedback for a specific user and joke
   */
  async findByUserAndJoke(userId: string, jokeId: number): Promise<UserJokeFeedback | null> {
    return await this.queryFirst<UserJokeFeedback>(
      `SELECT * FROM ${this.tableName} WHERE user_id = ? AND joke_id = ?`,
      [userId, jokeId]
    );
  }

  /**
   * Get all feedback for a user
   */
  async findByUser(userId: string, options: PaginationOptions = {}): Promise<UserJokeFeedback[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<UserJokeFeedback>(
      `SELECT * FROM ${this.tableName} 
       WHERE user_id = ? 
       ORDER BY ts DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  }

  /**
   * Get all feedback for a joke
   */
  async findByJoke(jokeId: number): Promise<UserJokeFeedback[]> {
    return await this.query<UserJokeFeedback>(
      `SELECT * FROM ${this.tableName} 
       WHERE joke_id = ? 
       ORDER BY ts DESC`,
      [jokeId]
    );
  }

  /**
   * Get feedback by sentiment
   */
  async findBySentiment(sentiment: 'like' | 'neutral' | 'dislike', options: PaginationOptions = {}): Promise<UserJokeFeedback[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<UserJokeFeedback>(
      `SELECT * FROM ${this.tableName} 
       WHERE sentiment = ? 
       ORDER BY ts DESC 
       LIMIT ? OFFSET ?`,
      [sentiment, limit, offset]
    );
  }

  /**
   * Update feedback (upsert - insert or update)
   */
  async upsert(feedback: Omit<UserJokeFeedback, 'id' | 'ts'>): Promise<number> {
    const { user_id, joke_id, sentiment } = feedback;
    
    // Check if feedback already exists
    const existing = await this.findByUserAndJoke(user_id, joke_id);
    
    if (existing) {
      // Update existing feedback
      await this.executeSql(
        `UPDATE ${this.tableName} 
         SET sentiment = ?, ts = CURRENT_TIMESTAMP 
         WHERE user_id = ? AND joke_id = ?`,
        [sentiment, user_id, joke_id]
      );
      return existing.id!;
    } else {
      // Create new feedback
      return await this.create(feedback);
    }
  }

  /**
   * Delete feedback
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    
    return result.changes > 0;
  }

  /**
   * Delete feedback by user and joke
   */
  async deleteByUserAndJoke(userId: string, jokeId: number): Promise<boolean> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} WHERE user_id = ? AND joke_id = ?`,
      [userId, jokeId]
    );
    
    return result.changes > 0;
  }

  /**
   * Get sentiment statistics for a joke
   */
  async getJokeStats(jokeId: number): Promise<{ likes: number; neutrals: number; dislikes: number }> {
    const stats = await this.query<{ sentiment: string; count: number }>(
      `SELECT sentiment, COUNT(*) as count 
       FROM ${this.tableName} 
       WHERE joke_id = ? 
       GROUP BY sentiment`,
      [jokeId]
    );
    
    const result = { likes: 0, neutrals: 0, dislikes: 0 };
    
    stats.forEach(stat => {
      switch (stat.sentiment) {
        case 'like':
          result.likes = stat.count;
          break;
        case 'neutral':
          result.neutrals = stat.count;
          break;
        case 'dislike':
          result.dislikes = stat.count;
          break;
      }
    });
    
    return result;
  }

  /**
   * Get user's sentiment statistics
   */
  async getUserStats(userId: string): Promise<{ likes: number; neutrals: number; dislikes: number }> {
    const stats = await this.query<{ sentiment: string; count: number }>(
      `SELECT sentiment, COUNT(*) as count 
       FROM ${this.tableName} 
       WHERE user_id = ? 
       GROUP BY sentiment`,
      [userId]
    );
    
    const result = { likes: 0, neutrals: 0, dislikes: 0 };
    
    stats.forEach(stat => {
      switch (stat.sentiment) {
        case 'like':
          result.likes = stat.count;
          break;
        case 'neutral':
          result.neutrals = stat.count;
          break;
        case 'dislike':
          result.dislikes = stat.count;
          break;
      }
    });
    
    return result;
  }

  /**
   * Get most liked jokes
   */
  async getMostLikedJokes(limit: number = 10): Promise<{ joke_id: number; like_count: number }[]> {
    return await this.query<{ joke_id: number; like_count: number }>(
      `SELECT joke_id, COUNT(*) as like_count 
       FROM ${this.tableName} 
       WHERE sentiment = 'like' 
       GROUP BY joke_id 
       ORDER BY like_count DESC 
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * Count total feedback entries
   */
  async count(): Promise<number> {
    const result = await this.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );
    
    return result?.count || 0;
  }

  /**
   * Delete old feedback entries (cleanup)
   */
  async deleteOlderThan(days: number): Promise<number> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} 
       WHERE ts < datetime('now', '-${days} days')`,
      []
    );
    
    return result.changes;
  }
}