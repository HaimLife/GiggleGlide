import { MigrationManager } from '../MigrationManager';
import { DatabaseService } from '../DatabaseService';
import { SchemaManager } from '../SchemaManager';

// Mock dependencies
jest.mock('../DatabaseService');
jest.mock('../SchemaManager');

describe('MigrationManager', () => {
  let migrationManager: MigrationManager;
  let mockDbService: any;
  let mockSchemaManager: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockDbService = {
      initialize: jest.fn().mockResolvedValue(undefined),
      queryFirst: jest.fn().mockResolvedValue({ version: 0 }),
      executeSql: jest.fn().mockResolvedValue({}),
      transaction: jest.fn().mockImplementation(async (callback) => {
        await callback();
      }),
    };
    
    mockSchemaManager = {
      createSchema: jest.fn().mockResolvedValue(undefined),
      verifySchema: jest.fn().mockResolvedValue(true),
      dropAllTables: jest.fn().mockResolvedValue(undefined),
    };
    
    // Mock getInstance to return our mocks
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDbService);
    (SchemaManager as jest.Mock).mockImplementation(() => mockSchemaManager);
    
    migrationManager = new MigrationManager();
  });

  describe('initialize', () => {
    it('should initialize database successfully', async () => {
      await expect(migrationManager.initialize()).resolves.not.toThrow();
      
      expect(mockDbService.initialize).toHaveBeenCalled();
      expect(mockSchemaManager.createSchema).toHaveBeenCalled();
      expect(mockSchemaManager.verifySchema).toHaveBeenCalled();
    });

    it('should throw error if schema verification fails', async () => {
      mockSchemaManager.verifySchema.mockResolvedValue(false);
      
      await expect(migrationManager.initialize()).rejects.toThrow(
        'Schema verification failed after initialization'
      );
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current database version', async () => {
      mockDbService.queryFirst.mockResolvedValue({ version: 5 });
      
      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe(5);
    });

    it('should return 0 if no version exists', async () => {
      mockDbService.queryFirst.mockResolvedValue(null);
      
      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe(0);
    });

    it('should return 0 if query fails', async () => {
      mockDbService.queryFirst.mockRejectedValue(new Error('Table not found'));
      
      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe(0);
    });
  });

  describe('setVersion', () => {
    it('should insert version record', async () => {
      await migrationManager.setVersion(3);
      
      expect(mockDbService.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        [3]
      );
    });
  });

  describe('reset', () => {
    it('should drop all tables and reinitialize', async () => {
      await migrationManager.reset();
      
      expect(mockSchemaManager.dropAllTables).toHaveBeenCalled();
      expect(mockDbService.initialize).toHaveBeenCalled();
      expect(mockSchemaManager.createSchema).toHaveBeenCalled();
    });
  });
});