import { LanguageDetector, JokeFormatter, JokeValidator } from '../jokeFormatting';
import { Joke } from '../../services/database/types';

describe('LanguageDetector', () => {
  describe('detectLanguage', () => {
    it('should detect English correctly', () => {
      const result = LanguageDetector.detectLanguage('Why did the chicken cross the road?');
      expect(result.language).toBe('en');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should detect Spanish correctly', () => {
      const result = LanguageDetector.detectLanguage('¿Por qué cruzó el pollo la carretera?');
      expect(result.language).toBe('es');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect French correctly', () => {
      const result = LanguageDetector.detectLanguage('Pourquoi le poulet a-t-il traversé la route?');
      expect(result.language).toBe('fr');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle empty text', () => {
      const result = LanguageDetector.detectLanguage('');
      expect(result.language).toBe('en');
      expect(result.confidence).toBe(0);
    });

    it('should default to English for ambiguous text', () => {
      const result = LanguageDetector.detectLanguage('123 456 789');
      expect(result.language).toBe('en');
    });
  });

  describe('validateJokeLanguage', () => {
    it('should validate correct language match', () => {
      const joke: Joke = {
        txt: 'Why did the chicken cross the road?',
        lang: 'en',
        style: 'general',
        format: 'qa',
        topic: 'general',
        tone: 'light'
      };
      expect(LanguageDetector.validateJokeLanguage(joke)).toBe(true);
    });

    it('should invalidate language mismatch', () => {
      const joke: Joke = {
        txt: '¿Por qué cruzó el pollo la carretera?',
        lang: 'en', // Wrong language
        style: 'general',
        format: 'qa',
        topic: 'general',
        tone: 'light'
      };
      expect(LanguageDetector.validateJokeLanguage(joke)).toBe(false);
    });
  });
});

describe('JokeFormatter', () => {
  const mockJokes: { [key: string]: Joke } = {
    qa: {
      txt: 'Why did the chicken cross the road? To get to the other side!',
      lang: 'en',
      style: 'general',
      format: 'qa',
      topic: 'general',
      tone: 'light'
    },
    dialogue: {
      txt: "Knock knock!\nWho's there?\nBoo.\nBoo who?\nDon't cry, it's just a joke!",
      lang: 'en',
      style: 'knock-knock',
      format: 'dialogue',
      topic: 'general',
      tone: 'silly'
    },
    story: {
      txt: `A man walks into a bar. The bartender looks up and says, "Hey, aren't you that famous comedian?" The man replies, "No, I think you have me confused with someone else." The bartender says, "Oh sorry, you just looked familiar." The man says, "Well, I do have one of those faces." And then he walked out.`,
      lang: 'en',
      style: 'observational',
      format: 'story',
      topic: 'general',
      tone: 'witty'
    },
    list: {
      txt: 'Three reasons I love programming:\n1. It pays well\n2. I can work from home\n3. Debugging is like being a detective',
      lang: 'en',
      style: 'general',
      format: 'list',
      topic: 'technology',
      tone: 'light'
    },
    text: {
      txt: 'I told my wife she was drawing her eyebrows too high. She looked surprised.',
      lang: 'en',
      style: 'pun',
      format: 'text',
      topic: 'family',
      tone: 'witty'
    }
  };

  describe('formatJokeText', () => {
    it('should format Q&A jokes with proper line breaks', () => {
      const formatted = JokeFormatter.formatJokeText(mockJokes.qa);
      expect(formatted).toContain('Why did the chicken cross the road?');
      expect(formatted).toContain('To get to the other side!');
      expect(formatted.split('\n').length).toBeGreaterThan(1);
    });

    it('should format dialogue jokes with proper formatting', () => {
      const formatted = JokeFormatter.formatJokeText(mockJokes.dialogue);
      expect(formatted).toContain('Knock knock!');
      expect(formatted).toContain("Who's there?");
      // Check that it maintains line breaks
      expect(formatted.split('\n').length).toBeGreaterThan(1);
    });

    it('should format story jokes with paragraphs', () => {
      const formatted = JokeFormatter.formatJokeText(mockJokes.story);
      const paragraphs = formatted.split('\n\n');
      expect(paragraphs.length).toBeGreaterThan(1);
    });

    it('should format list jokes with numbers', () => {
      const formatted = JokeFormatter.formatJokeText(mockJokes.list);
      expect(formatted).toMatch(/\d+\./);
    });

    it('should clean up text jokes', () => {
      const formatted = JokeFormatter.formatJokeText(mockJokes.text);
      expect(formatted).toBe(mockJokes.text.txt);
    });
  });

  describe('getJokeMetadata', () => {
    it('should calculate reading time correctly', () => {
      const metadata = JokeFormatter.getJokeMetadata(mockJokes.text);
      expect(metadata.estimatedReadingTime).toBeGreaterThan(0);
      expect(metadata.wordCount).toBeGreaterThan(0);
      expect(metadata.language).toBe('en');
      expect(['easy', 'medium', 'hard']).toContain(metadata.difficulty);
    });

    it('should detect difficulty based on word count', () => {
      const shortJoke = { ...mockJokes.text, txt: 'Short joke.' };
      const longJoke = { ...mockJokes.story };
      
      const shortMetadata = JokeFormatter.getJokeMetadata(shortJoke);
      const longMetadata = JokeFormatter.getJokeMetadata(longJoke);
      
      expect(shortMetadata.difficulty).toBe('easy');
      expect(longMetadata.difficulty).toBe('hard');
    });
  });

  describe('formatForContext', () => {
    it('should truncate for list context', () => {
      const formatted = JokeFormatter.formatForContext(mockJokes.story, 'list');
      expect(formatted.length).toBeLessThanOrEqual(103); // 100 + '...'
      if (mockJokes.story.txt.length > 100) {
        expect(formatted).toEndWith('...');
      }
    });

    it('should include metadata for full context', () => {
      const formatted = JokeFormatter.formatForContext(mockJokes.text, 'full');
      expect(formatted).toContain('words');
      expect(formatted).toContain('read');
      expect(formatted).toContain(mockJokes.text.style);
    });

    it('should return normal format for card context', () => {
      const formatted = JokeFormatter.formatForContext(mockJokes.text, 'card');
      expect(formatted).toBe(JokeFormatter.formatJokeText(mockJokes.text));
    });
  });
});

describe('JokeValidator', () => {
  const validJoke: Joke = {
    txt: 'Why did the chicken cross the road? To get to the other side!',
    lang: 'en',
    style: 'general',
    format: 'qa',
    topic: 'general',
    tone: 'light'
  };

  describe('validateJoke', () => {
    it('should pass valid jokes', () => {
      const result = JokeValidator.validateJoke(validJoke);
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.score).toBeGreaterThan(60);
    });

    it('should fail jokes that are too short', () => {
      const shortJoke = { ...validJoke, txt: 'Short.' };
      const result = JokeValidator.validateJoke(shortJoke);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Joke text too short');
    });

    it('should fail jokes that are too long', () => {
      const longJoke = { ...validJoke, txt: 'A'.repeat(501) };
      const result = JokeValidator.validateJoke(longJoke);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Joke text too long');
    });

    it('should fail jokes without proper punctuation', () => {
      const noPuncJoke = { ...validJoke, txt: 'Why did the chicken cross the road' };
      const result = JokeValidator.validateJoke(noPuncJoke);
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Missing proper ending punctuation');
    });

    it('should validate Q&A format requirements', () => {
      const qaJoke = { ...validJoke, format: 'qa' as const, txt: 'This is not a question.' };
      const result = JokeValidator.validateJoke(qaJoke);
      expect(result.issues).toContain('Q&A format should contain a question');
    });

    it('should validate knock-knock format requirements', () => {
      const knockJoke = { ...validJoke, format: 'dialogue' as const, style: 'knock-knock' as const, txt: 'Who is there?' };
      const result = JokeValidator.validateJoke(knockJoke);
      expect(result.issues).toContain('Knock-knock format should contain "knock"');
    });

    it('should detect language mismatches', () => {
      const mismatchJoke = { ...validJoke, txt: '¿Por qué?', lang: 'en' };
      const result = JokeValidator.validateJoke(mismatchJoke);
      expect(result.issues).toContain('Language mismatch detected');
    });
  });

  describe('isFamilyFriendly', () => {
    it('should approve family-friendly jokes', () => {
      const familyJoke = { ...validJoke, tone: 'family-friendly' as const };
      expect(JokeValidator.isFamilyFriendly(familyJoke)).toBe(true);
    });

    it('should reject dark humor', () => {
      const darkJoke = { ...validJoke, style: 'dark' as const };
      expect(JokeValidator.isFamilyFriendly(darkJoke)).toBe(false);
    });

    it('should approve jokes with family topics and tones', () => {
      const animalJoke = { ...validJoke, topic: 'animals' as const, tone: 'silly' as const };
      expect(JokeValidator.isFamilyFriendly(animalJoke)).toBe(true);
    });

    it('should be cautious with work-related topics', () => {
      const workJoke = { ...validJoke, topic: 'work' as const, tone: 'witty' as const };
      expect(JokeValidator.isFamilyFriendly(workJoke)).toBe(false);
    });
  });
});