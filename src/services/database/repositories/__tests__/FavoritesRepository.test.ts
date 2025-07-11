import { FavoritesRepository } from '../FavoritesRepository';
import { JokeRepository } from '../JokeRepository';
import { DatabaseInitializer } from '../../DatabaseInitializer';
import { DatabaseService } from '../../DatabaseService';

describe('FavoritesRepository', () => {
  let repository: FavoritesRepository;
  let jokeRepository: JokeRepository;
  let dbService: DatabaseService;
  let testJokeIds: number[] = [];
  const testUserId = 'user123';

  beforeAll(async () => {
    await DatabaseInitializer.initialize();
    dbService = DatabaseService.getInstance();
    repository = new FavoritesRepository();
    jokeRepository = new JokeRepository();
  });

  afterAll(async () => {
    await DatabaseInitializer.close();
  });

  beforeEach(async () => {
    // Clear tables before each test
    await dbService.executeSql('DELETE FROM favorites');
    await dbService.executeSql('DELETE FROM jokes');
    
    // Create test jokes
    testJokeIds = [];
    for (let i = 1; i <= 5; i++) {
      const id = await jokeRepository.create({ txt: `Test joke ${i}` });
      testJokeIds.push(id);
    }
  });

  describe('add', () => {
    it('should add a joke to favorites', async () => {
      const added = await repository.add(testUserId, testJokeIds[0]);
      expect(added).toBe(true);

      const isFav = await repository.isFavorite(testUserId, testJokeIds[0]);
      expect(isFav).toBe(true);
    });

    it('should return false when adding duplicate favorite', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      const addedAgain = await repository.add(testUserId, testJokeIds[0]);
      expect(addedAgain).toBe(false);
    });
  });

  describe('remove', () => {
    it('should remove a joke from favorites', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      
      const removed = await repository.remove(testUserId, testJokeIds[0]);
      expect(removed).toBe(true);

      const isFav = await repository.isFavorite(testUserId, testJokeIds[0]);
      expect(isFav).toBe(false);
    });

    it('should return false when removing non-existent favorite', async () => {
      const removed = await repository.remove(testUserId, testJokeIds[0]);
      expect(removed).toBe(false);
    });
  });

  describe('isFavorite', () => {
    it('should check if joke is favorited', async () => {
      expect(await repository.isFavorite(testUserId, testJokeIds[0])).toBe(false);
      
      await repository.add(testUserId, testJokeIds[0]);
      
      expect(await repository.isFavorite(testUserId, testJokeIds[0])).toBe(true);
    });
  });

  describe('findByUser', () => {
    beforeEach(async () => {
      // Add multiple favorites
      await repository.add(testUserId, testJokeIds[0]);
      await repository.add(testUserId, testJokeIds[1]);
      await repository.add(testUserId, testJokeIds[2]);
      await repository.add('otherUser', testJokeIds[0]);
    });

    it('should find all favorites for a user', async () => {
      const favorites = await repository.findByUser(testUserId);
      expect(favorites).toHaveLength(3);
      favorites.forEach(fav => expect(fav.user_id).toBe(testUserId));
    });

    it('should support pagination', async () => {
      const page1 = await repository.findByUser(testUserId, { limit: 2, offset: 0 });
      const page2 = await repository.findByUser(testUserId, { limit: 2, offset: 2 });
      
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });

    it('should order by timestamp descending', async () => {
      const favorites = await repository.findByUser(testUserId);
      // Most recent first (testJokeIds[2] was added last)
      expect(favorites[0].joke_id).toBe(testJokeIds[2]);
    });
  });

  describe('findJokesByUser', () => {
    beforeEach(async () => {
      await repository.add(testUserId, testJokeIds[0]);
      await repository.add(testUserId, testJokeIds[1]);
      
      // Flag one joke
      await jokeRepository.setFlagged(testJokeIds[1], true);
    });

    it('should return full joke data for favorites', async () => {
      const jokes = await repository.findJokesByUser(testUserId);
      expect(jokes).toHaveLength(1); // Only non-flagged joke
      expect(jokes[0].txt).toBe('Test joke 1');
    });

    it('should not return flagged jokes', async () => {
      const jokes = await repository.findJokesByUser(testUserId);
      expect(jokes).toHaveLength(1);
      expect(jokes[0].id).toBe(testJokeIds[0]);
    });
  });

  describe('getJokeFavoriteCount', () => {
    it('should count favorites for a joke', async () => {
      await repository.add('user1', testJokeIds[0]);
      await repository.add('user2', testJokeIds[0]);
      await repository.add('user3', testJokeIds[0]);

      const count = await repository.getJokeFavoriteCount(testJokeIds[0]);
      expect(count).toBe(3);
    });

    it('should return 0 for joke with no favorites', async () => {
      const count = await repository.getJokeFavoriteCount(testJokeIds[0]);
      expect(count).toBe(0);
    });
  });

  describe('getUserFavoriteCount', () => {
    it('should count favorites for a user', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      await repository.add(testUserId, testJokeIds[1]);
      await repository.add(testUserId, testJokeIds[2]);

      const count = await repository.getUserFavoriteCount(testUserId);
      expect(count).toBe(3);
    });
  });

  describe('getMostFavorited', () => {
    beforeEach(async () => {
      // Joke 0: 4 favorites
      await repository.add('user1', testJokeIds[0]);
      await repository.add('user2', testJokeIds[0]);
      await repository.add('user3', testJokeIds[0]);
      await repository.add('user4', testJokeIds[0]);
      
      // Joke 1: 2 favorites
      await repository.add('user1', testJokeIds[1]);
      await repository.add('user2', testJokeIds[1]);
      
      // Joke 2: 3 favorites
      await repository.add('user1', testJokeIds[2]);
      await repository.add('user2', testJokeIds[2]);
      await repository.add('user3', testJokeIds[2]);
    });

    it('should return most favorited jokes in order', async () => {
      const mostFavorited = await repository.getMostFavorited(2);
      
      expect(mostFavorited).toHaveLength(2);
      expect(mostFavorited[0].joke_id).toBe(testJokeIds[0]);
      expect(mostFavorited[0].favorite_count).toBe(4);
      expect(mostFavorited[1].joke_id).toBe(testJokeIds[2]);
      expect(mostFavorited[1].favorite_count).toBe(3);
    });
  });

  describe('getUsersWhoFavorited', () => {
    it('should return users who favorited a joke', async () => {
      await repository.add('user1', testJokeIds[0]);
      await repository.add('user2', testJokeIds[0]);
      await repository.add('user3', testJokeIds[0]);

      const users = await repository.getUsersWhoFavorited(testJokeIds[0]);
      expect(users).toHaveLength(3);
      expect(users).toContain('user1');
      expect(users).toContain('user2');
      expect(users).toContain('user3');
    });
  });

  describe('toggle', () => {
    it('should add favorite if not exists', async () => {
      const result = await repository.toggle(testUserId, testJokeIds[0]);
      expect(result).toBe(true); // Now favorited

      const isFav = await repository.isFavorite(testUserId, testJokeIds[0]);
      expect(isFav).toBe(true);
    });

    it('should remove favorite if exists', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      
      const result = await repository.toggle(testUserId, testJokeIds[0]);
      expect(result).toBe(false); // Now unfavorited

      const isFav = await repository.isFavorite(testUserId, testJokeIds[0]);
      expect(isFav).toBe(false);
    });
  });

  describe('areFavorites', () => {
    beforeEach(async () => {
      await repository.add(testUserId, testJokeIds[0]);
      await repository.add(testUserId, testJokeIds[2]);
      await repository.add(testUserId, testJokeIds[4]);
    });

    it('should bulk check favorite status', async () => {
      const checkIds = [testJokeIds[0], testJokeIds[1], testJokeIds[2]];
      const favoriteMap = await repository.areFavorites(testUserId, checkIds);
      
      expect(favoriteMap.get(testJokeIds[0])).toBe(true);
      expect(favoriteMap.get(testJokeIds[1])).toBe(false);
      expect(favoriteMap.get(testJokeIds[2])).toBe(true);
    });

    it('should handle empty array', async () => {
      const favoriteMap = await repository.areFavorites(testUserId, []);
      expect(favoriteMap.size).toBe(0);
    });
  });

  describe('removeAllForUser', () => {
    it('should remove all favorites for a user', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      await repository.add(testUserId, testJokeIds[1]);
      await repository.add(testUserId, testJokeIds[2]);
      await repository.add('otherUser', testJokeIds[0]);

      const removed = await repository.removeAllForUser(testUserId);
      expect(removed).toBe(3);

      const userFavs = await repository.findByUser(testUserId);
      expect(userFavs).toHaveLength(0);

      // Other user's favorites should remain
      const otherFavs = await repository.findByUser('otherUser');
      expect(otherFavs).toHaveLength(1);
    });
  });

  describe('getRecent', () => {
    beforeEach(async () => {
      for (let i = 0; i < 5; i++) {
        await repository.add(testUserId, testJokeIds[i]);
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      }
    });

    it('should get recent favorites', async () => {
      const recent = await repository.getRecent(testUserId, 3);
      
      expect(recent).toHaveLength(3);
      // Most recent first
      expect(recent[0].joke_id).toBe(testJokeIds[4]);
      expect(recent[1].joke_id).toBe(testJokeIds[3]);
      expect(recent[2].joke_id).toBe(testJokeIds[2]);
    });
  });

  describe('exportUserFavorites', () => {
    it('should export user favorites', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      await repository.add(testUserId, testJokeIds[2]);
      await repository.add(testUserId, testJokeIds[1]);

      const exported = await repository.exportUserFavorites(testUserId);
      
      expect(exported.joke_ids).toHaveLength(3);
      expect(exported.timestamps).toHaveLength(3);
      // Should be in chronological order
      expect(exported.joke_ids[0]).toBe(testJokeIds[0]);
      expect(exported.joke_ids[1]).toBe(testJokeIds[2]);
      expect(exported.joke_ids[2]).toBe(testJokeIds[1]);
    });
  });

  describe('importUserFavorites', () => {
    it('should import user favorites', async () => {
      const jokeIdsToImport = [testJokeIds[0], testJokeIds[2], testJokeIds[4]];
      
      const imported = await repository.importUserFavorites(testUserId, jokeIdsToImport);
      expect(imported).toBe(3);

      const favorites = await repository.findByUser(testUserId);
      expect(favorites).toHaveLength(3);
    });

    it('should skip duplicates when importing', async () => {
      await repository.add(testUserId, testJokeIds[0]);
      
      const jokeIdsToImport = [testJokeIds[0], testJokeIds[1]];
      const imported = await repository.importUserFavorites(testUserId, jokeIdsToImport);
      
      expect(imported).toBe(1); // Only testJokeIds[1] was imported
      
      const favorites = await repository.findByUser(testUserId);
      expect(favorites).toHaveLength(2);
    });
  });
});