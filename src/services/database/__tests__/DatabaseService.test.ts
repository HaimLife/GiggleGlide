import { DatabaseService } from '../DatabaseService';

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    closeAsync: jest.fn(),
    runAsync: jest.fn(),
    getAllAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    transactionAsync: jest.fn(),
  }),
}));

describe('DatabaseService', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    dbService = DatabaseService.getInstance();
  });

  it('should be a singleton', () => {
    const instance1 = DatabaseService.getInstance();
    const instance2 = DatabaseService.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should initialize database', async () => {
    await expect(dbService.initialize()).resolves.not.toThrow();
  });

  it('should throw error when accessing database before initialization', () => {
    const newInstance = DatabaseService.getInstance();
    expect(() => newInstance.getDatabase()).toThrow('Database not initialized');
  });
});