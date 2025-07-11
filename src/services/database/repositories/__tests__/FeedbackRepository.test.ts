import { FeedbackRepository } from '../FeedbackRepository';
import { JokeRepository } from '../JokeRepository';
import { DatabaseInitializer } from '../../DatabaseInitializer';
import { DatabaseService } from '../../DatabaseService';

describe('FeedbackRepository', () => {
  let repository: FeedbackRepository;
  let jokeRepository: JokeRepository;
  let dbService: DatabaseService;
  let testJokeIds: number[] = [];

  beforeAll(async () => {
    await DatabaseInitializer.initialize();
    dbService = DatabaseService.getInstance();
    repository = new FeedbackRepository();
    jokeRepository = new JokeRepository();
  });

  afterAll(async () => {
    await DatabaseInitializer.close();
  });

  beforeEach(async () => {
    // Clear tables before each test
    await dbService.executeSql('DELETE FROM user_joke_feedback');
    await dbService.executeSql('DELETE FROM jokes');
    
    // Create test jokes
    testJokeIds = [];
    for (let i = 1; i <= 3; i++) {
      const id = await jokeRepository.create({ txt: `Test joke ${i}` });
      testJokeIds.push(id);
    }
  });

  describe('create', () => {
    it('should create new feedback', async () => {
      const id = await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      expect(id).toBeGreaterThan(0);

      const feedback = await repository.findById(id);
      expect(feedback).toBeTruthy();
      expect(feedback?.user_id).toBe('user123');
      expect(feedback?.joke_id).toBe(testJokeIds[0]);
      expect(feedback?.sentiment).toBe('like');
    });

    it('should enforce valid sentiment values', async () => {
      await expect(repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'invalid' as any,
      })).rejects.toThrow();
    });
  });

  describe('findById', () => {
    it('should find feedback by id', async () => {
      const id = await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      const feedback = await repository.findById(id);
      expect(feedback).toBeTruthy();
      expect(feedback?.id).toBe(id);
    });

    it('should return null for non-existent id', async () => {
      const feedback = await repository.findById(999999);
      expect(feedback).toBeNull();
    });
  });

  describe('findByUserAndJoke', () => {
    it('should find feedback by user and joke', async () => {
      await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      const feedback = await repository.findByUserAndJoke('user123', testJokeIds[0]);
      expect(feedback).toBeTruthy();
      expect(feedback?.user_id).toBe('user123');
      expect(feedback?.joke_id).toBe(testJokeIds[0]);
    });

    it('should return null when not found', async () => {
      const feedback = await repository.findByUserAndJoke('user999', testJokeIds[0]);
      expect(feedback).toBeNull();
    });
  });

  describe('findByUser', () => {
    beforeEach(async () => {
      // Create feedback for multiple jokes
      await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });
      await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[1],
        sentiment: 'dislike',
      });
      await repository.create({
        user_id: 'user456',
        joke_id: testJokeIds[0],
        sentiment: 'neutral',
      });
    });

    it('should find all feedback for a user', async () => {
      const feedback = await repository.findByUser('user123');
      expect(feedback).toHaveLength(2);
      feedback.forEach(f => expect(f.user_id).toBe('user123'));
    });

    it('should support pagination', async () => {
      const page1 = await repository.findByUser('user123', { limit: 1, offset: 0 });
      const page2 = await repository.findByUser('user123', { limit: 1, offset: 1 });
      
      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].joke_id).not.toBe(page2[0].joke_id);
    });
  });

  describe('findByJoke', () => {
    beforeEach(async () => {
      await repository.create({
        user_id: 'user1',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });
      await repository.create({
        user_id: 'user2',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });
      await repository.create({
        user_id: 'user3',
        joke_id: testJokeIds[0],
        sentiment: 'dislike',
      });
    });

    it('should find all feedback for a joke', async () => {
      const feedback = await repository.findByJoke(testJokeIds[0]);
      expect(feedback).toHaveLength(3);
      feedback.forEach(f => expect(f.joke_id).toBe(testJokeIds[0]));
    });
  });

  describe('findBySentiment', () => {
    beforeEach(async () => {
      await repository.create({
        user_id: 'user1',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });
      await repository.create({
        user_id: 'user2',
        joke_id: testJokeIds[1],
        sentiment: 'like',
      });
      await repository.create({
        user_id: 'user3',
        joke_id: testJokeIds[2],
        sentiment: 'dislike',
      });
    });

    it('should find feedback by sentiment', async () => {
      const likes = await repository.findBySentiment('like');
      expect(likes).toHaveLength(2);
      likes.forEach(f => expect(f.sentiment).toBe('like'));

      const dislikes = await repository.findBySentiment('dislike');
      expect(dislikes).toHaveLength(1);
      expect(dislikes[0].sentiment).toBe('dislike');
    });
  });

  describe('upsert', () => {
    it('should create new feedback if not exists', async () => {
      const id = await repository.upsert({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      expect(id).toBeGreaterThan(0);
      
      const feedback = await repository.findById(id);
      expect(feedback?.sentiment).toBe('like');
    });

    it('should update existing feedback', async () => {
      // Create initial feedback
      const firstId = await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      // Upsert with different sentiment
      const secondId = await repository.upsert({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'dislike',
      });

      expect(secondId).toBe(firstId); // Same ID
      
      const feedback = await repository.findById(firstId);
      expect(feedback?.sentiment).toBe('dislike');
    });
  });

  describe('delete', () => {
    it('should delete feedback', async () => {
      const id = await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      const deleted = await repository.delete(id);
      expect(deleted).toBe(true);

      const feedback = await repository.findById(id);
      expect(feedback).toBeNull();
    });

    it('should return false for non-existent feedback', async () => {
      const deleted = await repository.delete(999999);
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByUserAndJoke', () => {
    it('should delete feedback by user and joke', async () => {
      await repository.create({
        user_id: 'user123',
        joke_id: testJokeIds[0],
        sentiment: 'like',
      });

      const deleted = await repository.deleteByUserAndJoke('user123', testJokeIds[0]);
      expect(deleted).toBe(true);

      const feedback = await repository.findByUserAndJoke('user123', testJokeIds[0]);
      expect(feedback).toBeNull();
    });
  });

  describe('getJokeStats', () => {
    beforeEach(async () => {
      // Create varied feedback for a joke
      await repository.create({ user_id: 'user1', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user2', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user3', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user4', joke_id: testJokeIds[0], sentiment: 'neutral' });
      await repository.create({ user_id: 'user5', joke_id: testJokeIds[0], sentiment: 'dislike' });
    });

    it('should get joke statistics', async () => {
      const stats = await repository.getJokeStats(testJokeIds[0]);
      
      expect(stats.likes).toBe(3);
      expect(stats.neutrals).toBe(1);
      expect(stats.dislikes).toBe(1);
    });

    it('should return zeros for joke without feedback', async () => {
      const stats = await repository.getJokeStats(testJokeIds[1]);
      
      expect(stats.likes).toBe(0);
      expect(stats.neutrals).toBe(0);
      expect(stats.dislikes).toBe(0);
    });
  });

  describe('getUserStats', () => {
    beforeEach(async () => {
      await repository.create({ user_id: 'user123', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user123', joke_id: testJokeIds[1], sentiment: 'like' });
      await repository.create({ user_id: 'user123', joke_id: testJokeIds[2], sentiment: 'dislike' });
    });

    it('should get user statistics', async () => {
      const stats = await repository.getUserStats('user123');
      
      expect(stats.likes).toBe(2);
      expect(stats.neutrals).toBe(0);
      expect(stats.dislikes).toBe(1);
    });
  });

  describe('getMostLikedJokes', () => {
    beforeEach(async () => {
      // Joke 0: 3 likes
      await repository.create({ user_id: 'user1', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user2', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user3', joke_id: testJokeIds[0], sentiment: 'like' });
      
      // Joke 1: 2 likes
      await repository.create({ user_id: 'user1', joke_id: testJokeIds[1], sentiment: 'like' });
      await repository.create({ user_id: 'user2', joke_id: testJokeIds[1], sentiment: 'like' });
      
      // Joke 2: 1 like, 1 dislike
      await repository.create({ user_id: 'user1', joke_id: testJokeIds[2], sentiment: 'like' });
      await repository.create({ user_id: 'user2', joke_id: testJokeIds[2], sentiment: 'dislike' });
    });

    it('should get most liked jokes in order', async () => {
      const mostLiked = await repository.getMostLikedJokes(2);
      
      expect(mostLiked).toHaveLength(2);
      expect(mostLiked[0].joke_id).toBe(testJokeIds[0]);
      expect(mostLiked[0].like_count).toBe(3);
      expect(mostLiked[1].joke_id).toBe(testJokeIds[1]);
      expect(mostLiked[1].like_count).toBe(2);
    });
  });

  describe('count', () => {
    it('should count total feedback entries', async () => {
      expect(await repository.count()).toBe(0);
      
      await repository.create({ user_id: 'user1', joke_id: testJokeIds[0], sentiment: 'like' });
      await repository.create({ user_id: 'user2', joke_id: testJokeIds[0], sentiment: 'dislike' });
      
      expect(await repository.count()).toBe(2);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old feedback entries', async () => {
      // Create feedback with old timestamp
      await dbService.executeSql(
        `INSERT INTO user_joke_feedback (user_id, joke_id, sentiment, ts) 
         VALUES (?, ?, ?, datetime('now', '-10 days'))`,
        ['user1', testJokeIds[0], 'like']
      );
      
      // Create recent feedback
      await repository.create({ user_id: 'user2', joke_id: testJokeIds[0], sentiment: 'like' });
      
      const deletedCount = await repository.deleteOlderThan(7);
      expect(deletedCount).toBe(1);
      
      const remaining = await repository.count();
      expect(remaining).toBe(1);
    });
  });
});