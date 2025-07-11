import { JokeRepository } from '../JokeRepository';
import { DatabaseInitializer } from '../../DatabaseInitializer';
import { DatabaseService } from '../../DatabaseService';
import { Joke } from '../../types';

describe('JokeRepository', () => {
  let repository: JokeRepository;
  let dbService: DatabaseService;

  beforeAll(async () => {
    await DatabaseInitializer.initialize();
    dbService = DatabaseService.getInstance();
    repository = new JokeRepository();
  });

  afterAll(async () => {
    await DatabaseInitializer.close();
  });

  beforeEach(async () => {
    // Clear jokes table before each test
    await dbService.executeSql('DELETE FROM jokes');
  });

  describe('create', () => {
    it('should create a new joke', async () => {
      const jokeData = {
        txt: 'Why did the programmer quit? He didn\'t get arrays.',
        lang: 'en',
        creator: 'test_user',
      };

      const id = await repository.create(jokeData);
      expect(id).toBeGreaterThan(0);

      const joke = await repository.findById(id);
      expect(joke).toBeTruthy();
      expect(joke?.txt).toBe(jokeData.txt);
      expect(joke?.lang).toBe(jokeData.lang);
      expect(joke?.creator).toBe(jokeData.creator);
      expect(joke?.is_flagged).toBe(0);
    });

    it('should use default values', async () => {
      const id = await repository.create({ txt: 'Test joke' });
      const joke = await repository.findById(id);
      
      expect(joke?.lang).toBe('en');
      expect(joke?.is_flagged).toBe(0);
      expect(joke?.creator).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find joke by id', async () => {
      const id = await repository.create({ txt: 'Test joke' });
      const joke = await repository.findById(id);
      
      expect(joke).toBeTruthy();
      expect(joke?.id).toBe(id);
    });

    it('should return null for non-existent id', async () => {
      const joke = await repository.findById(999999);
      expect(joke).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      // Create test jokes
      for (let i = 1; i <= 25; i++) {
        await repository.create({
          txt: `Test joke ${i}`,
          is_flagged: i % 10 === 0 ? 1 : 0, // Flag every 10th joke
        });
      }
    });

    it('should return jokes with pagination', async () => {
      const jokes = await repository.findAll({ limit: 10, offset: 0 });
      expect(jokes).toHaveLength(10);
    });

    it('should not return flagged jokes', async () => {
      const jokes = await repository.findAll({ limit: 30 });
      expect(jokes).toHaveLength(23); // 25 total - 2 flagged
      
      jokes.forEach(joke => {
        expect(joke.is_flagged).toBe(0);
      });
    });

    it('should respect offset', async () => {
      const page1 = await repository.findAll({ limit: 10, offset: 0 });
      const page2 = await repository.findAll({ limit: 10, offset: 10 });
      
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe('findByLanguage', () => {
    beforeEach(async () => {
      await repository.create({ txt: 'English joke', lang: 'en' });
      await repository.create({ txt: 'Spanish joke', lang: 'es' });
      await repository.create({ txt: 'French joke', lang: 'fr' });
      await repository.create({ txt: 'Another English joke', lang: 'en' });
    });

    it('should find jokes by language', async () => {
      const englishJokes = await repository.findByLanguage('en');
      expect(englishJokes).toHaveLength(2);
      englishJokes.forEach(joke => expect(joke.lang).toBe('en'));
    });

    it('should return empty array for unknown language', async () => {
      const jokes = await repository.findByLanguage('de');
      expect(jokes).toHaveLength(0);
    });
  });

  describe('findRandom', () => {
    beforeEach(async () => {
      for (let i = 1; i <= 10; i++) {
        await repository.create({ txt: `Joke ${i}`, lang: i <= 5 ? 'en' : 'es' });
      }
    });

    it('should return random jokes', async () => {
      const jokes1 = await repository.findRandom(3);
      const jokes2 = await repository.findRandom(3);
      
      expect(jokes1).toHaveLength(3);
      expect(jokes2).toHaveLength(3);
      // Results might be the same due to randomness, but order might differ
    });

    it('should filter by language', async () => {
      const jokes = await repository.findRandom(3, 'en');
      expect(jokes.length).toBeLessThanOrEqual(3);
      jokes.forEach(joke => expect(joke.lang).toBe('en'));
    });
  });

  describe('update', () => {
    it('should update joke fields', async () => {
      const id = await repository.create({ txt: 'Original joke' });
      
      const updated = await repository.update(id, {
        txt: 'Updated joke',
        creator: 'updater',
      });
      
      expect(updated).toBe(true);
      
      const joke = await repository.findById(id);
      expect(joke?.txt).toBe('Updated joke');
      expect(joke?.creator).toBe('updater');
    });

    it('should return false for non-existent joke', async () => {
      const updated = await repository.update(999999, { txt: 'Test' });
      expect(updated).toBe(false);
    });

    it('should not update if no valid fields provided', async () => {
      const id = await repository.create({ txt: 'Test joke' });
      const updated = await repository.update(id, {});
      expect(updated).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a joke', async () => {
      const id = await repository.create({ txt: 'To be deleted' });
      
      const deleted = await repository.delete(id);
      expect(deleted).toBe(true);
      
      const joke = await repository.findById(id);
      expect(joke).toBeNull();
    });

    it('should return false for non-existent joke', async () => {
      const deleted = await repository.delete(999999);
      expect(deleted).toBe(false);
    });
  });

  describe('setFlagged', () => {
    it('should flag and unflag a joke', async () => {
      const id = await repository.create({ txt: 'Test joke' });
      
      // Flag the joke
      await repository.setFlagged(id, true);
      let joke = await repository.findById(id);
      expect(joke?.is_flagged).toBe(1);
      
      // Unflag the joke
      await repository.setFlagged(id, false);
      joke = await repository.findById(id);
      expect(joke?.is_flagged).toBe(0);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      await repository.create({ txt: 'Joke 1' });
      await repository.create({ txt: 'Joke 2' });
      await repository.create({ txt: 'Joke 3', is_flagged: 1 });
    });

    it('should count non-flagged jokes', async () => {
      const count = await repository.count();
      expect(count).toBe(2);
    });

    it('should count all jokes including flagged', async () => {
      const count = await repository.count(true);
      expect(count).toBe(3);
    });
  });

  describe('findByCreator', () => {
    beforeEach(async () => {
      await repository.create({ txt: 'Joke 1', creator: 'user1' });
      await repository.create({ txt: 'Joke 2', creator: 'user1' });
      await repository.create({ txt: 'Joke 3', creator: 'user2' });
    });

    it('should find jokes by creator', async () => {
      const jokes = await repository.findByCreator('user1');
      expect(jokes).toHaveLength(2);
      jokes.forEach(joke => expect(joke.creator).toBe('user1'));
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await repository.create({ txt: 'Why did the chicken cross the road?' });
      await repository.create({ txt: 'A chicken walks into a bar' });
      await repository.create({ txt: 'What do you call a bear?' });
    });

    it('should search jokes by text', async () => {
      const jokes = await repository.search('chicken');
      expect(jokes).toHaveLength(2);
      jokes.forEach(joke => {
        expect(joke.txt.toLowerCase()).toContain('chicken');
      });
    });

    it('should return empty array for no matches', async () => {
      const jokes = await repository.search('xyz123');
      expect(jokes).toHaveLength(0);
    });
  });

  describe('bulkCreate', () => {
    it('should insert multiple jokes', async () => {
      const jokesToInsert: Omit<Joke, 'id' | 'created_at'>[] = [
        { txt: 'Joke 1' },
        { txt: 'Joke 2', lang: 'es' },
        { txt: 'Joke 3', creator: 'bulk_user' },
      ];

      const count = await repository.bulkCreate(jokesToInsert);
      expect(count).toBe(3);

      const allJokes = await repository.findAll();
      expect(allJokes).toHaveLength(3);
    });

    it('should rollback on error', async () => {
      const jokesToInsert: any[] = [
        { txt: 'Valid joke' },
        { txt: null }, // Invalid - will cause error
      ];

      await expect(repository.bulkCreate(jokesToInsert)).rejects.toThrow();
      
      const count = await repository.count();
      expect(count).toBe(0); // No jokes should be inserted
    });
  });
});