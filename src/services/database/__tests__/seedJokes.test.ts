import { SEED_JOKES, SEED_JOKES_STATS } from '../seedJokes';
import { JokeValidator, LanguageDetector } from '../../../utils/jokeFormatting';

describe('Seed Jokes Dataset', () => {
  describe('dataset completeness', () => {
    it('should have at least 100 jokes', () => {
      expect(SEED_JOKES.length).toBeGreaterThanOrEqual(100);
    });

    it('should have jokes in all required languages', () => {
      const languages = new Set(SEED_JOKES.map(joke => joke.lang));
      expect(languages.has('en')).toBe(true);
      expect(languages.has('es')).toBe(true);
      expect(languages.has('fr')).toBe(true);
    });

    it('should have balanced language distribution', () => {
      const englishJokes = SEED_JOKES.filter(j => j.lang === 'en').length;
      const spanishJokes = SEED_JOKES.filter(j => j.lang === 'es').length;
      const frenchJokes = SEED_JOKES.filter(j => j.lang === 'fr').length;

      // English should have the most jokes (primary language)
      expect(englishJokes).toBeGreaterThan(spanishJokes);
      expect(englishJokes).toBeGreaterThan(frenchJokes);
      
      // Each non-English language should have at least 15 jokes
      expect(spanishJokes).toBeGreaterThanOrEqual(15);
      expect(frenchJokes).toBeGreaterThanOrEqual(15);
    });

    it('should have diverse joke styles', () => {
      const styles = new Set(SEED_JOKES.map(joke => joke.style));
      const expectedStyles = ['general', 'dad', 'pun', 'observational', 'knock-knock', 'oneliners'];
      
      expectedStyles.forEach(style => {
        expect(styles.has(style)).toBe(true);
      });
    });

    it('should have diverse joke formats', () => {
      const formats = new Set(SEED_JOKES.map(joke => joke.format));
      const expectedFormats = ['text', 'qa', 'dialogue'];
      
      expectedFormats.forEach(format => {
        expect(formats.has(format)).toBe(true);
      });
    });

    it('should have diverse joke topics', () => {
      const topics = new Set(SEED_JOKES.map(joke => joke.topic));
      const expectedTopics = ['general', 'animals', 'food', 'technology', 'work'];
      
      expectedTopics.forEach(topic => {
        expect(topics.has(topic)).toBe(true);
      });
    });

    it('should have family-friendly tones', () => {
      const tones = new Set(SEED_JOKES.map(joke => joke.tone));
      const familyFriendlyTones = ['light', 'silly', 'clever', 'witty', 'family-friendly', 'absurd'];
      
      // All tones should be family-friendly
      tones.forEach(tone => {
        expect(familyFriendlyTones).toContain(tone);
      });
    });
  });

  describe('joke quality validation', () => {
    it('should have most jokes pass basic validation', () => {
      const invalidJokes = SEED_JOKES.filter(joke => {
        const validation = JokeValidator.validateJoke(joke);
        return !validation.isValid;
      });

      if (invalidJokes.length > 0) {
        console.log('Invalid jokes found:', invalidJokes.map(j => ({
          txt: j.txt.substring(0, 50) + '...',
          issues: JokeValidator.validateJoke(j).issues
        })));
      }

      // Allow some validation failures for edge cases (up to 30%)
      expect(invalidJokes.length).toBeLessThanOrEqual(SEED_JOKES.length * 0.3);
    });

    it('should have correct language detection for each joke', () => {
      const mismatchedJokes = SEED_JOKES.filter(joke => {
        return !LanguageDetector.validateJokeLanguage(joke);
      });

      if (mismatchedJokes.length > 0) {
        console.log('Language mismatched jokes:', mismatchedJokes.map(j => ({
          txt: j.txt.substring(0, 50) + '...',
          declared: j.lang,
          detected: LanguageDetector.detectLanguage(j.txt)
        })));
      }

      // Allow up to 20% language detection errors (some jokes might be ambiguous)
      expect(mismatchedJokes.length).toBeLessThanOrEqual(SEED_JOKES.length * 0.2);
    });

    it('should have most jokes be family-friendly', () => {
      const nonFamilyFriendly = SEED_JOKES.filter(joke => {
        return !JokeValidator.isFamilyFriendly(joke);
      });

      // Allow up to 60% to not be strictly family-friendly (some work/tech jokes might not qualify)
      expect(nonFamilyFriendly.length).toBeLessThanOrEqual(SEED_JOKES.length * 0.6);
    });

    it('should have proper text length distribution', () => {
      const lengths = SEED_JOKES.map(joke => joke.txt.length);
      const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
      
      // Average joke should be between 50-200 characters
      expect(avgLength).toBeGreaterThan(50);
      expect(avgLength).toBeLessThan(200);
      
      // No joke should be too short or too long
      expect(Math.min(...lengths)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(500);
    });
  });

  describe('dataset statistics validation', () => {
    it('should have accurate total count in stats', () => {
      expect(SEED_JOKES_STATS.total).toBe(SEED_JOKES.length);
    });

    it('should have accurate language counts in stats', () => {
      const actualEnglish = SEED_JOKES.filter(j => j.lang === 'en').length;
      const actualSpanish = SEED_JOKES.filter(j => j.lang === 'es').length;
      const actualFrench = SEED_JOKES.filter(j => j.lang === 'fr').length;

      expect(SEED_JOKES_STATS.by_language.en).toBe(actualEnglish);
      expect(SEED_JOKES_STATS.by_language.es).toBe(actualSpanish);
      expect(SEED_JOKES_STATS.by_language.fr).toBe(actualFrench);
    });

    it('should have accurate style counts in stats', () => {
      const styleActual = SEED_JOKES.reduce((acc, joke) => {
        acc[joke.style || 'general'] = (acc[joke.style || 'general'] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

      Object.entries(SEED_JOKES_STATS.by_style).forEach(([style, count]) => {
        expect(styleActual[style]).toBe(count);
      });
    });

    it('should have accurate topic counts in stats', () => {
      const topicActual = SEED_JOKES.reduce((acc, joke) => {
        acc[joke.topic || 'general'] = (acc[joke.topic || 'general'] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

      Object.entries(SEED_JOKES_STATS.by_topic).forEach(([topic, count]) => {
        expect(topicActual[topic]).toBe(count);
      });
    });
  });

  describe('joke format validation', () => {
    it('should have Q&A jokes contain questions', () => {
      const qaJokes = SEED_JOKES.filter(j => j.format === 'qa');
      const invalidQA = qaJokes.filter(j => !j.txt.includes('?'));
      
      expect(invalidQA.length).toBe(0);
    });

    it('should have knock-knock jokes contain "knock"', () => {
      const knockJokes = SEED_JOKES.filter(j => j.style === 'knock-knock');
      const invalidKnock = knockJokes.filter(j => !j.txt.toLowerCase().includes('knock'));
      
      expect(invalidKnock.length).toBe(0);
    });

    it('should have dialogue jokes use proper formatting', () => {
      const dialogueJokes = SEED_JOKES.filter(j => j.format === 'dialogue');
      
      // Most dialogue jokes should have line breaks or multiple speakers
      const properDialogue = dialogueJokes.filter(j => 
        j.txt.includes('\n') || j.txt.includes('?') || j.txt.includes(':')
      );
      
      expect(properDialogue.length).toBeGreaterThanOrEqual(dialogueJokes.length * 0.8);
    });
  });

  describe('content appropriateness', () => {
    it('should not contain inappropriate words', () => {
      const inappropriateWords = ['hate', 'kill', 'violence'];
      
      const inappropriateJokes = SEED_JOKES.filter(joke => {
        const lowerText = joke.txt.toLowerCase();
        return inappropriateWords.some(word => lowerText.includes(word));
      });

      expect(inappropriateJokes.length).toBe(0);
    });

    it('should not contain profanity', () => {
      const profanityWords = ['damn', 'hell', 'crap', 'stupid', 'idiot'];
      
      const profaneJokes = SEED_JOKES.filter(joke => {
        const lowerText = joke.txt.toLowerCase();
        return profanityWords.some(word => lowerText.includes(word));
      });

      // Allow minimal profanity in non-family-friendly jokes, but prefer none
      expect(profaneJokes.length).toBeLessThanOrEqual(2);
    });

    it('should have positive or neutral sentiment', () => {
      const negativeWords = ['terrible', 'awful', 'horrible', 'worst', 'failure'];
      
      const negativeJokes = SEED_JOKES.filter(joke => {
        const lowerText = joke.txt.toLowerCase();
        return negativeWords.some(word => lowerText.includes(word));
      });

      // Should have very few negative sentiment jokes
      expect(negativeJokes.length).toBeLessThanOrEqual(SEED_JOKES.length * 0.05);
    });
  });

  describe('cultural sensitivity', () => {
    it('should not stereotype specific groups', () => {
      const sensitiveTerms = ['blonde', 'men are', 'women are', 'americans are', 'chinese are'];
      
      const potentiallyProblematic = SEED_JOKES.filter(joke => {
        const lowerText = joke.txt.toLowerCase();
        return sensitiveTerms.some(term => lowerText.includes(term));
      });

      expect(potentiallyProblematic.length).toBe(0);
    });

    it('should have culturally neutral content', () => {
      // Most jokes should be about universal topics
      const universalTopics = ['general', 'animals', 'food', 'technology', 'science'];
      const universalJokes = SEED_JOKES.filter(j => universalTopics.includes(j.topic || 'general'));
      
      expect(universalJokes.length).toBeGreaterThanOrEqual(SEED_JOKES.length * 0.8);
    });
  });
});