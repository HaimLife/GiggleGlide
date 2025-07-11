import * as SQLite from 'expo-sqlite';
import { DATABASE_CONFIG, TABLES } from './config';

export class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private static instance: DatabaseService;

  private constructor() {}

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async initialize(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync(DATABASE_CONFIG.name);
      console.log('Database opened successfully');
    } catch (error) {
      console.error('Failed to open database:', error);
      throw new Error('Database initialization failed');
    }
  }

  getDatabase(): SQLite.SQLiteDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }

  async executeSql(sql: string, params: any[] = []): Promise<SQLite.SQLiteRunResult> {
    const db = this.getDatabase();
    return await db.runAsync(sql, params);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const db = this.getDatabase();
    return await db.getAllAsync(sql, params) as T[];
  }

  async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const db = this.getDatabase();
    return await db.getFirstAsync(sql, params) as T | null;
  }

  async transaction(callback: (tx: SQLite.SQLiteDatabase) => Promise<void>): Promise<void> {
    const db = this.getDatabase();
    await db.transactionAsync(async () => {
      await callback(db);
    });
  }
}