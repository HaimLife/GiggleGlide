import { UserPreferencesRepository } from '../UserPreferencesRepository';
import { DatabaseInitializer } from '../../DatabaseInitializer';
import { DatabaseService } from '../../DatabaseService';

describe('UserPreferencesRepository', () => {
  let repository: UserPreferencesRepository;
  let dbService: DatabaseService;

  beforeAll(async () => {
    await DatabaseInitializer.initialize();
    dbService = DatabaseService.getInstance();
    repository = new UserPreferencesRepository();
  });

  afterAll(async () => {
    await DatabaseInitializer.close();
  });

  beforeEach(async () => {
    // Clear user_preferences table before each test
    await dbService.executeSql('DELETE FROM user_preferences');
  });

  describe('create', () => {
    it('should create new user preferences', async () => {
      const id = await repository.create({
        locale: 'es',
        push_token: 'test_token_123',
      });

      expect(id).toBeGreaterThan(0);

      const prefs = await repository.findById(id);
      expect(prefs).toBeTruthy();
      expect(prefs?.locale).toBe('es');
      expect(prefs?.push_token).toBe('test_token_123');
    });

    it('should use default locale', async () => {
      const id = await repository.create({});
      const prefs = await repository.findById(id);
      
      expect(prefs?.locale).toBe('en');
      expect(prefs?.push_token).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find preferences by id', async () => {
      const id = await repository.create({ locale: 'fr' });
      const prefs = await repository.findById(id);
      
      expect(prefs).toBeTruthy();
      expect(prefs?.id).toBe(id);
      expect(prefs?.locale).toBe('fr');
    });

    it('should return null for non-existent id', async () => {
      const prefs = await repository.findById(999999);
      expect(prefs).toBeNull();
    });
  });

  describe('findLatest', () => {
    it('should return the most recent preferences', async () => {
      await repository.create({ locale: 'en' });
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const id2 = await repository.create({ locale: 'es' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.create({ locale: 'fr' });

      const latest = await repository.findLatest();
      expect(latest).toBeTruthy();
      expect(latest?.locale).toBe('fr');
    });

    it('should return null when no preferences exist', async () => {
      const latest = await repository.findLatest();
      expect(latest).toBeNull();
    });
  });

  describe('findByPushToken', () => {
    it('should find preferences by push token', async () => {
      await repository.create({ push_token: 'token_123' });
      await repository.create({ push_token: 'token_456' });

      const prefs = await repository.findByPushToken('token_123');
      expect(prefs).toBeTruthy();
      expect(prefs?.push_token).toBe('token_123');
    });

    it('should return null for non-existent token', async () => {
      const prefs = await repository.findByPushToken('non_existent');
      expect(prefs).toBeNull();
    });
  });

  describe('update', () => {
    it('should update preferences', async () => {
      const id = await repository.create({ locale: 'en' });
      
      const updated = await repository.update(id, {
        locale: 'es',
        push_token: 'new_token',
      });
      
      expect(updated).toBe(true);
      
      const prefs = await repository.findById(id);
      expect(prefs?.locale).toBe('es');
      expect(prefs?.push_token).toBe('new_token');
    });

    it('should update updated_at timestamp', async () => {
      const id = await repository.create({ locale: 'en' });
      const original = await repository.findById(id);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await repository.update(id, { locale: 'es' });
      const updated = await repository.findById(id);
      
      expect(updated?.updated_at).not.toBe(original?.updated_at);
    });

    it('should return false for non-existent id', async () => {
      const updated = await repository.update(999999, { locale: 'es' });
      expect(updated).toBe(false);
    });
  });

  describe('updateLocale', () => {
    it('should update only locale', async () => {
      const id = await repository.create({ 
        locale: 'en',
        push_token: 'token_123' 
      });
      
      await repository.updateLocale(id, 'fr');
      
      const prefs = await repository.findById(id);
      expect(prefs?.locale).toBe('fr');
      expect(prefs?.push_token).toBe('token_123'); // Unchanged
    });
  });

  describe('updatePushToken', () => {
    it('should update push token', async () => {
      const id = await repository.create({ push_token: 'old_token' });
      
      await repository.updatePushToken(id, 'new_token');
      
      const prefs = await repository.findById(id);
      expect(prefs?.push_token).toBe('new_token');
    });

    it('should allow null push token', async () => {
      const id = await repository.create({ push_token: 'token_123' });
      
      await repository.updatePushToken(id, null);
      
      const prefs = await repository.findById(id);
      expect(prefs?.push_token).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete preferences', async () => {
      const id = await repository.create({ locale: 'en' });
      
      const deleted = await repository.delete(id);
      expect(deleted).toBe(true);
      
      const prefs = await repository.findById(id);
      expect(prefs).toBeNull();
    });

    it('should return false for non-existent id', async () => {
      const deleted = await repository.delete(999999);
      expect(deleted).toBe(false);
    });
  });

  describe('getOrCreate', () => {
    it('should return existing preferences', async () => {
      const id = await repository.create({ locale: 'es' });
      
      const prefs = await repository.getOrCreate();
      expect(prefs.id).toBe(id);
      expect(prefs.locale).toBe('es');
    });

    it('should create new preferences with defaults', async () => {
      const prefs = await repository.getOrCreate({ 
        locale: 'fr',
        push_token: 'default_token' 
      });
      
      expect(prefs).toBeTruthy();
      expect(prefs.locale).toBe('fr');
      expect(prefs.push_token).toBe('default_token');
    });

    it('should use default values when not provided', async () => {
      const prefs = await repository.getOrCreate();
      
      expect(prefs.locale).toBe('en');
      expect(prefs.push_token).toBeNull();
    });
  });

  describe('isPushEnabled', () => {
    it('should return true when push token exists', async () => {
      const id = await repository.create({ push_token: 'token_123' });
      const enabled = await repository.isPushEnabled(id);
      expect(enabled).toBe(true);
    });

    it('should return false when push token is null', async () => {
      const id = await repository.create({ push_token: null });
      const enabled = await repository.isPushEnabled(id);
      expect(enabled).toBe(false);
    });

    it('should return false for non-existent id', async () => {
      const enabled = await repository.isPushEnabled(999999);
      expect(enabled).toBe(false);
    });
  });

  describe('findAll', () => {
    it('should return all preferences ordered by creation', async () => {
      await repository.create({ locale: 'en' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.create({ locale: 'es' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await repository.create({ locale: 'fr' });

      const all = await repository.findAll();
      expect(all).toHaveLength(3);
      // Most recent first
      expect(all[0].locale).toBe('fr');
      expect(all[1].locale).toBe('es');
      expect(all[2].locale).toBe('en');
    });
  });

  describe('count', () => {
    it('should count preferences entries', async () => {
      expect(await repository.count()).toBe(0);
      
      await repository.create({ locale: 'en' });
      expect(await repository.count()).toBe(1);
      
      await repository.create({ locale: 'es' });
      expect(await repository.count()).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should keep only the most recent entries', async () => {
      // Create 5 preferences entries
      for (let i = 1; i <= 5; i++) {
        await repository.create({ locale: `locale_${i}` });
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Keep only 2 most recent
      const deletedCount = await repository.cleanup(2);
      expect(deletedCount).toBe(3);

      const remaining = await repository.findAll();
      expect(remaining).toHaveLength(2);
      expect(remaining[0].locale).toBe('locale_5');
      expect(remaining[1].locale).toBe('locale_4');
    });

    it('should not delete anything if count is higher than total', async () => {
      await repository.create({ locale: 'en' });
      await repository.create({ locale: 'es' });

      const deletedCount = await repository.cleanup(5);
      expect(deletedCount).toBe(0);

      const count = await repository.count();
      expect(count).toBe(2);
    });
  });
});