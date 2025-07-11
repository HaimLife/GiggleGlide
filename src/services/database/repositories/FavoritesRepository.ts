import { BaseRepository } from './BaseRepository';
import { TABLES } from '../config';
import { Favorite, Joke, PaginationOptions } from '../types';

export class FavoritesRepository extends BaseRepository {
  constructor() {
    super(TABLES.FAVORITES);
  }

  /**
   * Add a joke to favorites
   */
  async add(userId: string, jokeId: number): Promise<boolean> {
    try {
      await this.executeSql(
        `INSERT INTO ${this.tableName} (user_id, joke_id) VALUES (?, ?)`,
        [userId, jokeId]
      );
      return true;
    } catch (error: any) {
      // Handle unique constraint violation (already favorited)
      if (error.message?.includes('UNIQUE constraint failed')) {
        console.log('Joke already in favorites');
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove a joke from favorites
   */
  async remove(userId: string, jokeId: number): Promise<boolean> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} WHERE user_id = ? AND joke_id = ?`,
      [userId, jokeId]
    );
    
    return result.changes > 0;
  }

  /**
   * Check if a joke is favorited by a user
   */
  async isFavorite(userId: string, jokeId: number): Promise<boolean> {
    const result = await this.queryFirst<Favorite>(
      `SELECT * FROM ${this.tableName} WHERE user_id = ? AND joke_id = ?`,
      [userId, jokeId]
    );
    
    return !!result;
  }

  /**
   * Get all favorites for a user
   */
  async findByUser(userId: string, options: PaginationOptions = {}): Promise<Favorite[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<Favorite>(
      `SELECT * FROM ${this.tableName} 
       WHERE user_id = ? 
       ORDER BY ts DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  }

  /**
   * Get all favorite jokes with full joke data for a user
   */
  async findJokesByUser(userId: string, options: PaginationOptions = {}): Promise<Joke[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<Joke>(
      `SELECT j.* FROM ${TABLES.JOKES} j
       INNER JOIN ${this.tableName} f ON j.id = f.joke_id
       WHERE f.user_id = ? AND j.is_flagged = 0
       ORDER BY f.ts DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
  }

  /**
   * Get favorite count for a joke
   */
  async getJokeFavoriteCount(jokeId: number): Promise<number> {
    const result = await this.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE joke_id = ?`,
      [jokeId]
    );
    
    return result?.count || 0;
  }

  /**
   * Get user's favorite count
   */
  async getUserFavoriteCount(userId: string): Promise<number> {
    const result = await this.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE user_id = ?`,
      [userId]
    );
    
    return result?.count || 0;
  }

  /**
   * Get most favorited jokes
   */
  async getMostFavorited(limit: number = 10): Promise<{ joke_id: number; favorite_count: number }[]> {
    return await this.query<{ joke_id: number; favorite_count: number }>(
      `SELECT joke_id, COUNT(*) as favorite_count 
       FROM ${this.tableName} 
       GROUP BY joke_id 
       ORDER BY favorite_count DESC 
       LIMIT ?`,
      [limit]
    );
  }

  /**
   * Get users who favorited a specific joke
   */
  async getUsersWhoFavorited(jokeId: number): Promise<string[]> {
    const results = await this.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM ${this.tableName} WHERE joke_id = ?`,
      [jokeId]
    );
    
    return results.map(r => r.user_id);
  }

  /**
   * Toggle favorite status
   */
  async toggle(userId: string, jokeId: number): Promise<boolean> {
    const isFav = await this.isFavorite(userId, jokeId);
    
    if (isFav) {
      await this.remove(userId, jokeId);
      return false; // Now unfavorited
    } else {
      await this.add(userId, jokeId);
      return true; // Now favorited
    }
  }

  /**
   * Bulk check if jokes are favorited
   */
  async areFavorites(userId: string, jokeIds: number[]): Promise<Map<number, boolean>> {
    if (jokeIds.length === 0) {
      return new Map();
    }
    
    const placeholders = jokeIds.map(() => '?').join(',');
    const results = await this.query<{ joke_id: number }>(
      `SELECT joke_id FROM ${this.tableName} 
       WHERE user_id = ? AND joke_id IN (${placeholders})`,
      [userId, ...jokeIds]
    );
    
    const favoriteSet = new Set(results.map(r => r.joke_id));
    const favoriteMap = new Map<number, boolean>();
    
    jokeIds.forEach(id => {
      favoriteMap.set(id, favoriteSet.has(id));
    });
    
    return favoriteMap;
  }

  /**
   * Remove all favorites for a user
   */
  async removeAllForUser(userId: string): Promise<number> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} WHERE user_id = ?`,
      [userId]
    );
    
    return result.changes;
  }

  /**
   * Get recent favorites
   */
  async getRecent(userId: string, limit: number = 5): Promise<Favorite[]> {
    return await this.query<Favorite>(
      `SELECT * FROM ${this.tableName} 
       WHERE user_id = ? 
       ORDER BY ts DESC 
       LIMIT ?`,
      [userId, limit]
    );
  }

  /**
   * Export user's favorites (for backup)
   */
  async exportUserFavorites(userId: string): Promise<{ joke_ids: number[]; timestamps: string[] }> {
    const favorites = await this.query<Favorite>(
      `SELECT joke_id, ts FROM ${this.tableName} 
       WHERE user_id = ? 
       ORDER BY ts ASC`,
      [userId]
    );
    
    return {
      joke_ids: favorites.map(f => f.joke_id),
      timestamps: favorites.map(f => f.ts || ''),
    };
  }

  /**
   * Import user's favorites (for restore)
   */
  async importUserFavorites(userId: string, jokeIds: number[]): Promise<number> {
    let imported = 0;
    
    await this.transaction(async () => {
      for (const jokeId of jokeIds) {
        const added = await this.add(userId, jokeId);
        if (added) imported++;
      }
    });
    
    return imported;
  }
}