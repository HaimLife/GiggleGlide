import { DatabaseService } from './DatabaseService';
import { SchemaManager } from './SchemaManager';
import { migrations, Migration } from './migrations';
import { TABLES, DATABASE_CONFIG } from './config';

export class MigrationManager {
  private dbService: DatabaseService;
  private schemaManager: SchemaManager;

  constructor() {
    this.dbService = DatabaseService.getInstance();
    this.schemaManager = new SchemaManager();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize database connection
      await this.dbService.initialize();
      
      // Create initial schema
      await this.schemaManager.createSchema();
      
      // Run any pending migrations
      await this.runMigrations();
      
      // Verify schema integrity
      const isValid = await this.schemaManager.verifySchema();
      if (!isValid) {
        throw new Error('Schema verification failed after initialization');
      }
      
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  async getCurrentVersion(): Promise<number> {
    try {
      const result = await this.dbService.queryFirst<{ version: number }>(
        `SELECT MAX(version) as version FROM ${TABLES.DB_VERSION}`
      );
      return result?.version ?? 0;
    } catch (error) {
      // Table might not exist yet
      return 0;
    }
  }

  async setVersion(version: number): Promise<void> {
    await this.dbService.executeSql(
      `INSERT INTO ${TABLES.DB_VERSION} (version) VALUES (?)`,
      [version]
    );
  }

  async runMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }
    
    console.log(`Found ${pendingMigrations.length} pending migrations`);
    
    for (const migration of pendingMigrations) {
      await this.runMigration(migration);
    }
  }

  private async runMigration(migration: Migration): Promise<void> {
    console.log(`Running migration ${migration.version}: ${migration.description}`);
    
    await this.dbService.transaction(async () => {
      // Execute up statements
      for (const statement of migration.up) {
        await this.dbService.executeSql(statement);
      }
      
      // Record the migration
      await this.setVersion(migration.version);
    });
    
    console.log(`Migration ${migration.version} completed successfully`);
  }

  async rollback(targetVersion: number): Promise<void> {
    const currentVersion = await this.getCurrentVersion();
    
    if (targetVersion >= currentVersion) {
      throw new Error('Target version must be less than current version');
    }
    
    const rollbackMigrations = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();
    
    for (const migration of rollbackMigrations) {
      if (!migration.down) {
        throw new Error(`Migration ${migration.version} does not support rollback`);
      }
      
      console.log(`Rolling back migration ${migration.version}`);
      
      await this.dbService.transaction(async () => {
        // Execute down statements
        for (const statement of migration.down) {
          await this.dbService.executeSql(statement);
        }
        
        // Remove the migration record
        await this.dbService.executeSql(
          `DELETE FROM ${TABLES.DB_VERSION} WHERE version = ?`,
          [migration.version]
        );
      });
    }
  }

  async reset(): Promise<void> {
    console.log('Resetting database...');
    await this.schemaManager.dropAllTables();
    await this.initialize();
  }
}