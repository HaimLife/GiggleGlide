import { MigrationManager } from './MigrationManager';
import { DatabaseService } from './DatabaseService';

export class DatabaseInitializer {
  private static isInitialized = false;
  private static migrationManager: MigrationManager;

  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('Database already initialized');
      return;
    }

    try {
      console.log('Initializing database...');
      
      this.migrationManager = new MigrationManager();
      await this.migrationManager.initialize();
      
      this.isInitialized = true;
      console.log('Database initialization complete');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw new Error('Database initialization failed');
    }
  }

  static async reset(): Promise<void> {
    if (!this.migrationManager) {
      throw new Error('Database not initialized');
    }
    
    await this.migrationManager.reset();
    this.isInitialized = false;
  }

  static async close(): Promise<void> {
    const dbService = DatabaseService.getInstance();
    await dbService.close();
    this.isInitialized = false;
  }

  static isReady(): boolean {
    return this.isInitialized;
  }
}