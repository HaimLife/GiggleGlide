import { BaseRepository } from './BaseRepository';
import { TABLES } from '../config';
import { Joke, PaginationOptions, JokeFilters } from '../types';

export class JokeRepository extends BaseRepository {
  constructor() {
    super(TABLES.JOKES);
  }

  /**
   * Create a new joke
   */
  async create(joke: Omit<Joke, 'id' | 'created_at'>): Promise<number> {
    const { 
      txt, 
      lang = 'en', 
      style = 'general',
      format = 'text',
      topic = 'general',
      tone = 'light',
      creator, 
      is_flagged = 0 
    } = joke;
    
    const result = await this.executeSql(
      `INSERT INTO ${this.tableName} (txt, lang, style, format, topic, tone, creator, is_flagged) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [txt, lang, style, format, topic, tone, creator, is_flagged]
    );
    
    return result.lastInsertRowId;
  }

  /**
   * Get a joke by ID
   */
  async findById(id: number): Promise<Joke | null> {
    return await this.queryFirst<Joke>(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
  }

  /**
   * Get all jokes with pagination
   */
  async findAll(options: PaginationOptions = {}): Promise<Joke[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE is_flagged = 0 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  /**
   * Get jokes by language
   */
  async findByLanguage(lang: string, options: PaginationOptions = {}): Promise<Joke[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE lang = ? AND is_flagged = 0 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [lang, limit, offset]
    );
  }

  /**
   * Get random jokes
   */
  async findRandom(count: number = 1, lang?: string): Promise<Joke[]> {
    const langCondition = lang ? 'AND lang = ?' : '';
    const params = lang ? [lang, count] : [count];
    
    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE is_flagged = 0 ${langCondition}
       ORDER BY RANDOM() 
       LIMIT ?`,
      params
    );
  }

  /**
   * Update a joke
   */
  async update(id: number, updates: Partial<Omit<Joke, 'id' | 'created_at'>>): Promise<boolean> {
    const updateFields: string[] = [];
    const params: any[] = [];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && key !== 'id' && key !== 'created_at') {
        updateFields.push(`${key} = ?`);
        params.push(value);
      }
    });
    
    if (updateFields.length === 0) {
      return false;
    }
    
    params.push(id);
    
    const result = await this.executeSql(
      `UPDATE ${this.tableName} SET ${updateFields.join(', ')} WHERE id = ?`,
      params
    );
    
    return result.changes > 0;
  }

  /**
   * Delete a joke
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.executeSql(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id]
    );
    
    return result.changes > 0;
  }

  /**
   * Flag/unflag a joke
   */
  async setFlagged(id: number, isFlagged: boolean): Promise<boolean> {
    return await this.update(id, { is_flagged: isFlagged ? 1 : 0 });
  }

  /**
   * Get total count of jokes
   */
  async count(includesFlagged: boolean = false): Promise<number> {
    const whereClause = includesFlagged ? '' : 'WHERE is_flagged = 0';
    
    const result = await this.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`
    );
    
    return result?.count || 0;
  }

  /**
   * Get jokes by creator
   */
  async findByCreator(creator: string, options: PaginationOptions = {}): Promise<Joke[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE creator = ? AND is_flagged = 0 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [creator, limit, offset]
    );
  }

  /**
   * Search jokes by text
   */
  async search(searchTerm: string, options: PaginationOptions = {}): Promise<Joke[]> {
    const { offset = 0, limit = 20 } = options;
    
    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE txt LIKE ? AND is_flagged = 0 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [`%${searchTerm}%`, limit, offset]
    );
  }

  /**
   * Bulk insert jokes - optimized for seed data
   */
  async bulkCreate(jokes: Omit<Joke, 'id' | 'created_at'>[]): Promise<number> {
    let insertedCount = 0;
    
    await this.transaction(async () => {
      // Use batch insert for better performance
      const batchSize = 50;
      for (let i = 0; i < jokes.length; i += batchSize) {
        const batch = jokes.slice(i, i + batchSize);
        const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values: any[] = [];
        
        batch.forEach(joke => {
          values.push(
            joke.txt,
            joke.lang || 'en',
            joke.style || 'general',
            joke.format || 'text',
            joke.topic || 'general',
            joke.tone || 'light',
            joke.creator,
            joke.is_flagged || 0
          );
        });
        
        await this.executeSql(
          `INSERT INTO ${this.tableName} (txt, lang, style, format, topic, tone, creator, is_flagged) VALUES ${placeholders}`,
          values
        );
        
        insertedCount += batch.length;
      }
    });
    
    return insertedCount;
  }

  /**
   * Get random joke excluding seen ones for specific user - optimized for <2s latency
   */
  async getRandomJoke(language?: string, excludeJokeIds: number[] = []): Promise<Joke | null> {
    const langCondition = language ? 'AND lang = ?' : '';
    const excludeCondition = excludeJokeIds.length > 0 ? 
      `AND id NOT IN (${excludeJokeIds.map(() => '?').join(',')})` : '';
    
    const params: any[] = [];
    if (language) params.push(language);
    if (excludeJokeIds.length > 0) params.push(...excludeJokeIds);
    
    // Use indexed query for fast performance
    const result = await this.queryFirst<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE is_flagged = 0 ${langCondition} ${excludeCondition}
       ORDER BY RANDOM() 
       LIMIT 1`,
      params
    );
    
    return result;
  }

  /**
   * Get multiple jokes by IDs - for batch operations
   */
  async findByIds(ids: number[]): Promise<Joke[]> {
    if (ids.length === 0) return [];
    
    const placeholders = ids.map(() => '?').join(',');
    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} WHERE id IN (${placeholders})`,
      ids
    );
  }

  /**
   * Get filtered jokes with advanced filtering
   */
  async findFiltered(filters: JokeFilters, options: PaginationOptions = {}): Promise<Joke[]> {
    const { offset = 0, limit = 20 } = options;
    const conditions: string[] = ['is_flagged = 0'];
    const params: any[] = [];

    if (filters.lang) {
      conditions.push('lang = ?');
      params.push(filters.lang);
    }

    if (filters.style) {
      conditions.push('style = ?');
      params.push(filters.style);
    }

    if (filters.format) {
      conditions.push('format = ?');
      params.push(filters.format);
    }

    if (filters.topic) {
      conditions.push('topic = ?');
      params.push(filters.topic);
    }

    if (filters.tone) {
      conditions.push('tone = ?');
      params.push(filters.tone);
    }

    if (filters.excludeSeenBy) {
      conditions.push(`id NOT IN (
        SELECT joke_id FROM ${TABLES.SEEN_JOKES} WHERE user_id = ?
      )`);
      params.push(filters.excludeSeenBy);
    }

    params.push(limit, offset);

    return await this.query<Joke>(
      `SELECT * FROM ${this.tableName} 
       WHERE ${conditions.join(' AND ')} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      params
    );
  }

  /**
   * Get count with filters
   */
  async countFiltered(filters: JokeFilters): Promise<number> {
    const conditions: string[] = ['is_flagged = 0'];
    const params: any[] = [];

    if (filters.lang) {
      conditions.push('lang = ?');
      params.push(filters.lang);
    }

    if (filters.style) {
      conditions.push('style = ?');
      params.push(filters.style);
    }

    if (filters.format) {
      conditions.push('format = ?');
      params.push(filters.format);
    }

    if (filters.topic) {
      conditions.push('topic = ?');
      params.push(filters.topic);
    }

    if (filters.tone) {
      conditions.push('tone = ?');
      params.push(filters.tone);
    }

    if (filters.excludeSeenBy) {
      conditions.push(`id NOT IN (
        SELECT joke_id FROM ${TABLES.SEEN_JOKES} WHERE user_id = ?
      )`);
      params.push(filters.excludeSeenBy);
    }

    const result = await this.queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE ${conditions.join(' AND ')}`,
      params
    );

    return result?.count || 0;
  }

  /**
   * Get jokes stats by language, style, etc.
   */
  async getStats(): Promise<{
    total: number;
    by_language: { [key: string]: number };
    by_style: { [key: string]: number };
    by_topic: { [key: string]: number };
    by_tone: { [key: string]: number };
  }> {
    const total = await this.count();
    
    const [byLang, byStyle, byTopic, byTone] = await Promise.all([
      this.query<{ lang: string; count: number }>(`
        SELECT lang, COUNT(*) as count 
        FROM ${this.tableName} 
        WHERE is_flagged = 0 
        GROUP BY lang
      `),
      this.query<{ style: string; count: number }>(`
        SELECT style, COUNT(*) as count 
        FROM ${this.tableName} 
        WHERE is_flagged = 0 
        GROUP BY style
      `),
      this.query<{ topic: string; count: number }>(`
        SELECT topic, COUNT(*) as count 
        FROM ${this.tableName} 
        WHERE is_flagged = 0 
        GROUP BY topic
      `),
      this.query<{ tone: string; count: number }>(`
        SELECT tone, COUNT(*) as count 
        FROM ${this.tableName} 
        WHERE is_flagged = 0 
        GROUP BY tone
      `)
    ]);

    return {
      total,
      by_language: Object.fromEntries(byLang.map(r => [r.lang, r.count])),
      by_style: Object.fromEntries(byStyle.map(r => [r.style, r.count])),
      by_topic: Object.fromEntries(byTopic.map(r => [r.topic, r.count])),
      by_tone: Object.fromEntries(byTone.map(r => [r.tone, r.count]))
    };
  }

  /**
   * Check if database needs seeding
   */
  async needsSeeding(): Promise<boolean> {
    const count = await this.count();
    return count === 0;
  }
}