import { DatabaseService } from './DatabaseService';
import { SCHEMA_STATEMENTS, INDEX_STATEMENTS } from './schema';
import { TABLES } from './config';

export class SchemaManager {
  private dbService: DatabaseService;

  constructor() {
    this.dbService = DatabaseService.getInstance();
  }

  async createSchema(): Promise<void> {
    try {
      console.log('Creating database schema...');
      
      // Create tables
      for (const statement of SCHEMA_STATEMENTS) {
        await this.dbService.executeSql(statement);
      }
      
      // Create indexes
      for (const statement of INDEX_STATEMENTS) {
        await this.dbService.executeSql(statement);
      }
      
      console.log('Database schema created successfully');
    } catch (error) {
      console.error('Failed to create schema:', error);
      throw new Error('Schema creation failed');
    }
  }

  async verifySchema(): Promise<boolean> {
    try {
      // Check if all tables exist
      const requiredTables = Object.values(TABLES);
      
      for (const tableName of requiredTables) {
        const result = await this.dbService.queryFirst<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
          [tableName]
        );
        
        if (!result) {
          console.error(`Table ${tableName} does not exist`);
          return false;
        }
      }
      
      console.log('Schema verification passed');
      return true;
    } catch (error) {
      console.error('Schema verification failed:', error);
      return false;
    }
  }

  async getTableInfo(tableName: string): Promise<any[]> {
    return await this.dbService.query(
      `PRAGMA table_info(${tableName})`
    );
  }

  async dropAllTables(): Promise<void> {
    const tables = Object.values(TABLES);
    
    // Disable foreign keys temporarily
    await this.dbService.executeSql('PRAGMA foreign_keys = OFF');
    
    try {
      for (const table of tables) {
        await this.dbService.executeSql(`DROP TABLE IF EXISTS ${table}`);
      }
    } finally {
      // Re-enable foreign keys
      await this.dbService.executeSql('PRAGMA foreign_keys = ON');
    }
  }
}