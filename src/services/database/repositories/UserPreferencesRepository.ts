import { BaseRepository } from './BaseRepository';
import { TABLES } from '../config';
import { UserPreferences } from '../types';

export class UserPreferencesRepository extends BaseRepository {
  constructor() {
    super(TABLES.USER_PREFERENCES);
  }

  /**
   * Create new user preferences
   */
  async create(preferences: Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const { locale = 'en', push_token } = preferences;
    
    const result = await this.executeSql(
      `INSERT INTO ${this.tableName} (locale, push_token) VALUES (?, ?)`,
      [locale, push_token]
    );
    
    return result.lastInsertRowId;
  }

  /**
   * Get user preferences by ID
   */
  async findById(id: number): Promise<UserPreferences | null> {
    return await this.queryFirst<UserPreferences>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
  }

  /**
   * Get the most recent user preferences (for single user apps)
   */
  async findLatest(): Promise<UserPreferences | null> {
    return await this.queryFirst<UserPreferences>(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT 1`
    );
  }

  /**
   * Get user preferences by push token
   */
  async findByPushToken(pushToken: string): Promise<UserPreferences | null> {
    return await this.queryFirst<UserPreferences>(
      `SELECT * FROM ${this.tableName} WHERE push_token = ?`,
      [pushToken]
    );
  }

  /**
   * Update user preferences
   */
  async update(id: number, updates: Partial<Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'>>): Promise<boolean> {
    const updateFields: string[] = [];
    const params: any[] = [];
    
    // Always update the updated_at timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at' && key !== 'updated_at') {
        updateFields.push(`${key} = ?`);
        params.push(value);
      }
    });
    
    params.push(id);
    
    const result = await this.executeSql(
      `UPDATE ${this.tableName} SET ${updateFields.join(', ')} WHERE id = ?`,
      params
    );
    
    return result.changes > 0;
  }

  /**
   * Update locale
   */
  async updateLocale(id: number, locale: string): Promise<boolean> {
    return await this.update(id, { locale });
  }

  /**
   * Update push token
   */
  async updatePushToken(id: number, pushToken: string | null): Promise<boolean> {
    return await this.update(id, { push_token: pushToken });
  }

  /**
   * Delete user preferences
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    
    return result.changes > 0;
  }

  /**
   * Get or create user preferences
   * Returns existing preferences or creates new ones with defaults
   */
  async getOrCreate(defaults: Omit<UserPreferences, 'id' | 'created_at' | 'updated_at'> = {}): Promise<UserPreferences> {
    // First try to get the latest preferences
    let preferences = await this.findLatest();
    
    if (!preferences) {
      // Create new preferences with defaults
      const id = await this.create({
        locale: defaults.locale || 'en',
        push_token: defaults.push_token || null,
      });
      
      preferences = await this.findById(id);
      if (!preferences) {
        throw new Error('Failed to create user preferences');
      }
    }
    
    return preferences;
  }

  /**
   * Check if push notifications are enabled (has push token)
   */
  async isPushEnabled(id: number): Promise<boolean> {
    const preferences = await this.findById(id);
    return !!preferences?.push_token;
  }

  /**
   * Get all user preferences (for multi-user scenarios)
   */
  async findAll(): Promise<UserPreferences[]> {
    return await this.query<UserPreferences>(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC`
    );
  }

  /**
   * Count total user preferences
   */
  async count(): Promise<number> {
    const result = await this.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );
    
    return result?.count || 0;
  }

  /**
   * Delete old preferences entries (cleanup)
   * Keeps only the most recent N entries
   */
  async cleanup(keepCount: number = 1): Promise<number> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} 
       WHERE id NOT IN (
         SELECT id FROM ${this.tableName} 
         ORDER BY created_at DESC 
         LIMIT ?
       )`,
      [keepCount]
    );
    
    return result.changes;
  }
}