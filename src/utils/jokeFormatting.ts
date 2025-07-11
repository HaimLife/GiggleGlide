import { Joke, JokeFormat } from '../services/database/types';

/**
 * Language detection utilities
 */
export class LanguageDetector {
  private static readonly LANGUAGE_PATTERNS = {
    en: /^[a-zA-Z\s\p{P}0-9]+$/u,
    es: /[ñáéíóúü]/i,
    fr: /[àâäçéèêëïîôùûüÿ]/i
  };

  private static readonly COMMON_WORDS = {
    en: ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'a', 'an'],
    es: ['el', 'la', 'los', 'las', 'y', 'o', 'pero', 'en', 'de', 'con', 'por', 'para', 'un', 'una'],
    fr: ['le', 'la', 'les', 'et', 'ou', 'mais', 'dans', 'sur', 'à', 'de', 'avec', 'par', 'un', 'une']
  };

  /**
   * Detect language of a text with confidence score
   */
  static detectLanguage(text: string): { language: string; confidence: number } {
    if (!text || text.trim().length === 0) {
      return { language: 'en', confidence: 0 };
    }

    const normalizedText = text.toLowerCase();
    const scores: { [key: string]: number } = { en: 0, es: 0, fr: 0 };

    // Check for language-specific characters
    Object.entries(this.LANGUAGE_PATTERNS).forEach(([lang, pattern]) => {
      if (lang !== 'en' && pattern.test(normalizedText)) {
        scores[lang] += 3;
      }
    });

    // Check for common words
    const words = normalizedText.split(/\s+/);
    Object.entries(this.COMMON_WORDS).forEach(([lang, commonWords]) => {
      const matches = words.filter(word => commonWords.includes(word)).length;
      scores[lang] += matches;
    });

    // Default bonus for English if no clear indicators
    if (scores.es === 0 && scores.fr === 0) {
      scores.en += 1;
    }

    // Find highest scoring language
    const maxScore = Math.max(...Object.values(scores));
    const detectedLang = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0] || 'en';
    
    // Calculate confidence based on score difference
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const confidence = totalScore > 0 ? maxScore / totalScore : 0.33;

    return { language: detectedLang, confidence };
  }

  /**
   * Validate if joke language matches detected language
   */
  static validateJokeLanguage(joke: Joke): boolean {
    const detection = this.detectLanguage(joke.txt);
    return detection.language === joke.lang && detection.confidence > 0.5;
  }
}

/**
 * Text formatting utilities for different joke formats
 */
export class JokeFormatter {
  /**
   * Format joke text based on its format type
   */
  static formatJokeText(joke: Joke): string {
    if (!joke.txt) return '';

    switch (joke.format) {
      case 'qa':
        return this.formatQAJoke(joke.txt);
      case 'dialogue':
        return this.formatDialogueJoke(joke.txt);
      case 'story':
        return this.formatStoryJoke(joke.txt);
      case 'list':
        return this.formatListJoke(joke.txt);
      case 'text':
      default:
        return this.formatTextJoke(joke.txt);
    }
  }

  /**
   * Format Q&A style jokes
   */
  private static formatQAJoke(text: string): string {
    // Split on common question indicators
    const qaParts = text.split(/\?[\s\n]+/);
    if (qaParts.length >= 2) {
      const question = qaParts[0].trim() + '?';
      const answer = qaParts.slice(1).join(' ').trim();
      return `${question}\n\n${answer}`;
    }
    return text;
  }

  /**
   * Format dialogue style jokes (knock-knock, conversations)
   */
  private static formatDialogueJoke(text: string): string {
    // Replace newlines with proper dialogue formatting
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Add emphasis to speakers in knock-knock jokes
        if (line.toLowerCase().includes('knock knock')) {
          return `**${line}**`;
        }
        if (line.toLowerCase().includes("who's there")) {
          return `*${line}*`;
        }
        return line;
      })
      .join('\n');
  }

  /**
   * Format story style jokes
   */
  private static formatStoryJoke(text: string): string {
    // Add paragraph breaks for longer stories
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 3) {
      // Group sentences into paragraphs
      const paragraphs: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        const paragraph = sentences.slice(i, i + 2).join('. ').trim();
        if (paragraph) {
          paragraphs.push(paragraph + (paragraph.endsWith('.') ? '' : '.'));
        }
      }
      return paragraphs.join('\n\n');
    }
    return text;
  }

  /**
   * Format list style jokes
   */
  private static formatListJoke(text: string): string {
    // Convert numbered or bulleted lists to proper formatting
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    return lines.map((line, index) => {
      // If line doesn't start with a number or bullet, add one
      if (!/^[\d•\-\*]/.test(line)) {
        return `${index + 1}. ${line}`;
      }
      return line;
    }).join('\n');
  }

  /**
   * Format regular text jokes
   */
  private static formatTextJoke(text: string): string {
    // Clean up spacing and ensure proper punctuation
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/([.!?])([A-Z])/g, '$1 $2'); // Add space after punctuation if missing
  }

  /**
   * Get joke display metadata
   */
  static getJokeMetadata(joke: Joke): {
    estimatedReadingTime: number; // in seconds
    wordCount: number;
    language: string;
    difficulty: 'easy' | 'medium' | 'hard';
  } {
    const words = joke.txt.split(/\s+/).length;
    const readingTime = Math.max(2, Math.ceil(words / 3)); // ~3 words per second minimum 2s
    
    // Determine difficulty based on word count and style
    let difficulty: 'easy' | 'medium' | 'hard' = 'easy';
    if (words > 50 || joke.style === 'observational' || joke.style === 'wordplay') {
      difficulty = 'hard';
    } else if (words > 20 || joke.style === 'pun') {
      difficulty = 'medium';
    }

    const detection = LanguageDetector.detectLanguage(joke.txt);

    return {
      estimatedReadingTime: readingTime,
      wordCount: words,
      language: detection.language,
      difficulty
    };
  }

  /**
   * Format joke for different contexts (card, list, full view, share)
   */
  static formatForContext(joke: Joke, context: 'card' | 'list' | 'full' | 'share'): string {
    const formatted = this.formatJokeText(joke);
    
    switch (context) {
      case 'list':
        // Truncate for list view
        const maxLength = 100;
        if (formatted.length > maxLength) {
          return formatted.substring(0, maxLength - 3) + '...';
        }
        return formatted;
        
      case 'card':
        // Optimize for card display
        return formatted;
        
      case 'share':
        // Optimized for sharing - clean formatting without markup
        return formatted
          .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markup
          .replace(/\*(.*?)\*/g, '$1')     // Remove italic markup
          .trim();
        
      case 'full':
        // Full formatting with metadata
        const metadata = this.getJokeMetadata(joke);
        const tags = [
          joke.style,
          joke.topic,
          joke.tone,
          `${metadata.wordCount} words`,
          `${metadata.estimatedReadingTime}s read`
        ].filter(Boolean).join(' • ');
        
        return `${formatted}\n\n*${tags}*`;
        
      default:
        return formatted;
    }
  }
}

/**
 * Utility functions for joke validation and quality checks
 */
export class JokeValidator {
  /**
   * Validate joke content quality
   */
  static validateJoke(joke: Joke): {
    isValid: boolean;
    issues: string[];
    score: number; // 0-100 quality score
  } {
    const issues: string[] = [];
    let score = 100;

    // Check minimum length
    if (joke.txt.length < 10) {
      issues.push('Joke text too short');
      score -= 30;
    }

    // Check maximum length
    if (joke.txt.length > 500) {
      issues.push('Joke text too long');
      score -= 20;
    }

    // Check for proper punctuation
    if (!/[.!?]$/.test(joke.txt.trim())) {
      issues.push('Missing proper ending punctuation');
      score -= 10;
    }

    // Check language consistency
    if (!LanguageDetector.validateJokeLanguage(joke)) {
      issues.push('Language mismatch detected');
      score -= 15;
    }

    // Check for inappropriate content markers
    const inappropriateWords = ['hate', 'kill', 'death', 'blood'];
    const hasInappropriate = inappropriateWords.some(word => 
      joke.txt.toLowerCase().includes(word)
    );
    if (hasInappropriate && joke.tone !== 'dark') {
      issues.push('Potentially inappropriate content');
      score -= 25;
    }

    // Format-specific validations
    if (joke.format === 'qa' && !joke.txt.includes('?')) {
      issues.push('Q&A format should contain a question');
      score -= 20;
    }

    if (joke.format === 'knock-knock' && !joke.txt.toLowerCase().includes('knock')) {
      issues.push('Knock-knock format should contain "knock"');
      score -= 20;
    }

    return {
      isValid: issues.length === 0 && score >= 60,
      issues,
      score: Math.max(0, score)
    };
  }

  /**
   * Check if joke is appropriate for family-friendly context
   */
  static isFamilyFriendly(joke: Joke): boolean {
    // Already marked as family-friendly
    if (joke.tone === 'family-friendly') return true;
    
    // Dark humor is generally not family-friendly
    if (joke.style === 'dark') return false;
    
    // Check for family-friendly indicators
    const familyTopics = ['animals', 'food', 'general', 'science'];
    const familyTones = ['light', 'silly', 'family-friendly'];
    
    return familyTopics.includes(joke.topic || 'general') &&
           familyTones.includes(joke.tone || 'light');
  }
}