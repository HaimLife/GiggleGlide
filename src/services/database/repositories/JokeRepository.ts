import { BaseRepository } from './BaseRepository';
import { TABLES } from '../config';
import { Joke, PaginationOptions } from '../types';

export class JokeRepository extends BaseRepository {
  constructor() {
    super(TABLES.JOKES);
  }

  /**
   * Create a new joke
   */
  async create(joke: Omit<Joke, 'id' | 'created_at'>): Promise<number> {
    const { txt, lang = 'en', creator, is_flagged = 0 } = joke;
    
    const result = await this.executeSql(
      `INSERT INTO ${this.tableName} (txt, lang, creator, is_flagged) VALUES (?, ?, ?, ?)`,
      [txt, lang, creator, is_flagged]
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
   * Bulk insert jokes
   */
  async bulkCreate(jokes: Omit<Joke, 'id' | 'created_at'>[]): Promise<number> {
    let insertedCount = 0;
    
    await this.transaction(async () => {
      for (const joke of jokes) {
        await this.create(joke);
        insertedCount++;
      }
    });
    
    return insertedCount;
  }
}