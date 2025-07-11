import { SchemaManager } from '../SchemaManager';
import { DatabaseService } from '../DatabaseService';
import { TABLES } from '../config';

// Mock DatabaseService
jest.mock('../DatabaseService', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      executeSql: jest.fn().mockResolvedValue({}),
      queryFirst: jest.fn().mockResolvedValue({ name: 'test_table' }),
      query: jest.fn().mockResolvedValue([]),
    })),
  },
}));

describe('SchemaManager', () => {
  let schemaManager: SchemaManager;
  let mockDbService: any;

  beforeEach(() => {
    schemaManager = new SchemaManager();
    mockDbService = DatabaseService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create schema successfully', async () => {
    await expect(schemaManager.createSchema()).resolves.not.toThrow();
    
    // Verify that executeSql was called for each schema statement
    expect(mockDbService.executeSql).toHaveBeenCalled();
  });

  it('should verify schema successfully when all tables exist', async () => {
    const result = await schemaManager.verifySchema();
    expect(result).toBe(true);
    
    // Verify queries were made for each table
    const tableCount = Object.values(TABLES).length;
    expect(mockDbService.queryFirst).toHaveBeenCalledTimes(tableCount);
  });

  it('should fail schema verification when tables are missing', async () => {
    mockDbService.queryFirst.mockResolvedValueOnce(null);
    
    const result = await schemaManager.verifySchema();
    expect(result).toBe(false);
  });

  it('should drop all tables', async () => {
    await schemaManager.dropAllTables();
    
    // Verify foreign keys were disabled and re-enabled
    expect(mockDbService.executeSql).toHaveBeenCalledWith('PRAGMA foreign_keys = OFF');
    expect(mockDbService.executeSql).toHaveBeenCalledWith('PRAGMA foreign_keys = ON');
    
    // Verify DROP TABLE was called for each table
    Object.values(TABLES).forEach(table => {
      expect(mockDbService.executeSql).toHaveBeenCalledWith(`DROP TABLE IF EXISTS ${table}`);
    });
  });
});