import { DatabaseService } from '../DatabaseService';
import { SQLiteRunResult } from 'expo-sqlite';

export abstract class BaseRepository {
  protected dbService: DatabaseService;
  protected tableName: string;

  constructor(tableName: string) {
    this.dbService = DatabaseService.getInstance();
    this.tableName = tableName;
  }

  protected async executeSql(sql: string, params: any[] = []): Promise<SQLiteRunResult> {
    try {
      return await this.dbService.executeSql(sql, params);
    } catch (error) {
      console.error(`Error executing SQL in ${this.tableName}:`, error);
      throw new Error(`Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      return await this.dbService.query<T>(sql, params);
    } catch (error) {
      console.error(`Error querying ${this.tableName}:`, error);
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    try {
      return await this.dbService.queryFirst<T>(sql, params);
    } catch (error) {
      console.error(`Error querying first from ${this.tableName}:`, error);
      throw new Error(`Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async transaction(callback: (tx: any) => Promise<void>): Promise<void> {
    try {
      await this.dbService.transaction(callback);
    } catch (error) {
      console.error(`Transaction error in ${this.tableName}:`, error);
      throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected buildWhereClause(conditions: Record<string, any>): { clause: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];

    Object.entries(conditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        clauses.push(`${key} = ?`);
        params.push(value);
      }
    });

    return {
      clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }
}