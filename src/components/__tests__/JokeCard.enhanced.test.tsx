import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import JokeCard from '../JokeCard';
import { Joke } from '../../services/database/types';

// Mock the utilities
jest.mock('../../utils/jokeFormatting', () => ({
  JokeFormatter: {
    formatForContext: jest.fn((joke) => joke.txt)
  }
}));

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  return {
    ...Reanimated,
    createAnimatedComponent: (Component: any) => Component,
    useAnimatedStyle: jest.fn(() => ({})),
    useAnimatedGestureHandler: jest.fn(() => ({})),
    useSharedValue: jest.fn(() => ({ value: 0 })),
    withSpring: jest.fn(),
    withTiming: jest.fn(),
    runOnJS: jest.fn((fn) => fn),
    interpolate: jest.fn(),
    interpolateColor: jest.fn(),
    Extrapolate: { CLAMP: 'clamp' },
  };
});

// Mock gesture handler
jest.mock('react-native-gesture-handler', () => ({
  PanGestureHandler: ({ children }: any) => children,
  State: { BEGAN: 'BEGAN', FAILED: 'FAILED', ACTIVE: 'ACTIVE', END: 'END' },
}));

// Mock other dependencies
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: any) => children,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

describe('JokeCard Enhanced', () => {
  const mockJoke: Joke & { id: string } = {
    id: '1',
    txt: 'Why did the chicken cross the road? To get to the other side!',
    lang: 'en',
    style: 'dad',
    format: 'qa',
    topic: 'animals',
    tone: 'silly',
    creator: 'test',
    is_flagged: 0
  };

  const defaultProps = {
    joke: mockJoke,
    onSwipeLeft: jest.fn(),
    onSwipeRight: jest.fn(),
    onSwipeUp: jest.fn(),
    onPullToRefresh: jest.fn(),
    isActive: true,
    isLoading: false,
    error: null,
    showHints: false,
    reducedMotion: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering with enhanced joke data', () => {
    it('should render joke text correctly', () => {
      const { getByText } = render(<JokeCard {...defaultProps} />);
      expect(getByText(mockJoke.txt)).toBeTruthy();
    });

    it('should display style metadata', () => {
      const { getByText } = render(<JokeCard {...defaultProps} />);
      expect(getByText('DAD')).toBeTruthy();
    });

    it('should display topic metadata when not general', () => {
      const { getByText } = render(<JokeCard {...defaultProps} />);
      expect(getByText('ANIMALS')).toBeTruthy();
    });

    it('should display tone metadata', () => {
      const { getByText } = render(<JokeCard {...defaultProps} />);
      expect(getByText('SILLY')).toBeTruthy();
    });

    it('should hide general topic', () => {
      const jokeWithGeneralTopic = {
        ...mockJoke,
        topic: 'general' as const
      };
      const { queryByText } = render(
        <JokeCard {...defaultProps} joke={jokeWithGeneralTopic} />
      );
      expect(queryByText('GENERAL')).toBeNull();
    });

    it('should apply correct text styles for different formats', () => {
      const { getByTestId } = render(<JokeCard {...defaultProps} />);
      const card = getByTestId('joke-card');
      expect(card).toBeTruthy();
    });
  });

  describe('joke formats', () => {
    it('should render dialogue jokes with appropriate styling', () => {
      const dialogueJoke = {
        ...mockJoke,
        format: 'dialogue' as const,
        style: 'knock-knock' as const,
        txt: 'Knock knock!\nWho\'s there?\nBoo.\nBoo who?\nDon\'t cry!'
      };
      
      const { getByText } = render(
        <JokeCard {...defaultProps} joke={dialogueJoke} />
      );
      expect(getByText(dialogueJoke.txt)).toBeTruthy();
    });

    it('should render Q&A jokes correctly', () => {
      const qaJoke = {
        ...mockJoke,
        format: 'qa' as const,
        txt: 'What do you call a fake noodle? An impasta!'
      };
      
      const { getByText } = render(
        <JokeCard {...defaultProps} joke={qaJoke} />
      );
      expect(getByText(qaJoke.txt)).toBeTruthy();
    });

    it('should render list jokes with proper formatting', () => {
      const listJoke = {
        ...mockJoke,
        format: 'list' as const,
        txt: '1. First reason\n2. Second reason\n3. Third reason'
      };
      
      const { getByText } = render(
        <JokeCard {...defaultProps} joke={listJoke} />
      );
      expect(getByText(listJoke.txt)).toBeTruthy();
    });

    it('should render story jokes with extended line limit', () => {
      const storyJoke = {
        ...mockJoke,
        format: 'story' as const,
        txt: 'Once upon a time, there was a very long story joke that needed more lines to display properly because it contained multiple sentences and paragraphs.'
      };
      
      const { getByText } = render(
        <JokeCard {...defaultProps} joke={storyJoke} />
      );
      expect(getByText(storyJoke.txt)).toBeTruthy();
    });
  });

  describe('accessibility with enhanced data', () => {
    it('should include style and topic in accessibility label', () => {
      const { getByRole } = render(<JokeCard {...defaultProps} />);
      const card = getByRole('button');
      
      expect(card.props.accessibilityLabel).toContain('Topic: animals');
      expect(card.props.accessibilityLabel).toContain('Style: dad');
    });

    it('should handle jokes without optional metadata', () => {
      const simpleJoke = {
        id: '2',
        txt: 'Simple joke without metadata.'
      } as Joke & { id: string };
      
      const { getByRole } = render(
        <JokeCard {...defaultProps} joke={simpleJoke} />
      );
      const card = getByRole('button');
      expect(card.props.accessibilityLabel).toContain('Simple joke without metadata.');
    });
  });

  describe('joke formatting integration', () => {
    const { JokeFormatter } = require('../../utils/jokeFormatting');
    
    it('should call JokeFormatter.formatForContext with correct parameters', () => {
      render(<JokeCard {...defaultProps} />);
      expect(JokeFormatter.formatForContext).toHaveBeenCalledWith(mockJoke, 'card');
    });

    it('should use formatted text in display', () => {
      const formattedText = 'Formatted joke text';
      JokeFormatter.formatForContext.mockReturnValue(formattedText);
      
      const { getByText } = render(<JokeCard {...defaultProps} />);
      expect(getByText(formattedText)).toBeTruthy();
    });
  });

  describe('style variations', () => {
    it('should display all major joke styles', () => {
      const styles = ['dad', 'pun', 'observational', 'knock-knock', 'oneliners'];
      
      styles.forEach(style => {
        const styledJoke = { ...mockJoke, style: style as any };
        const { getByText } = render(
          <JokeCard {...defaultProps} joke={styledJoke} />
        );
        expect(getByText(style.toUpperCase())).toBeTruthy();
      });
    });

    it('should display all major topics', () => {
      const topics = ['animals', 'food', 'technology', 'work', 'family'];
      
      topics.forEach(topic => {
        const topicJoke = { ...mockJoke, topic: topic as any };
        const { getByText } = render(
          <JokeCard {...defaultProps} joke={topicJoke} />
        );
        expect(getByText(topic.toUpperCase())).toBeTruthy();
      });
    });

    it('should display all tones', () => {
      const tones = ['light', 'silly', 'clever', 'witty', 'family-friendly'];
      
      tones.forEach(tone => {
        const toneJoke = { ...mockJoke, tone: tone as any };
        const { getByText } = render(
          <JokeCard {...defaultProps} joke={toneJoke} />
        );
        expect(getByText(tone.toUpperCase())).toBeTruthy();
      });
    });
  });

  describe('multilingual support', () => {
    it('should render Spanish jokes correctly', () => {
      const spanishJoke = {
        ...mockJoke,
        txt: '¿Por qué los pájaros vuelan hacia el sur en invierno?',
        lang: 'es'
      };
      
      const { getByText } = render(
        <JokeCard {...defaultProps} joke={spanishJoke} />
      );
      expect(getByText(spanishJoke.txt)).toBeTruthy();
    });

    it('should render French jokes correctly', () => {
      const frenchJoke = {
        ...mockJoke,
        txt: 'Pourquoi les plongeurs plongent-ils toujours en arrière?',
        lang: 'fr'
      };
      
      const { getByText } = render(
        <JokeCard {...defaultProps} joke={frenchJoke} />
      );
      expect(getByText(frenchJoke.txt)).toBeTruthy();
    });
  });

  describe('error handling', () => {
    it('should handle jokes with missing required fields gracefully', () => {
      const incompleteJoke = {
        id: '3',
        txt: 'Incomplete joke'
      } as any;
      
      expect(() => {
        render(<JokeCard {...defaultProps} joke={incompleteJoke} />);
      }).not.toThrow();
    });

    it('should handle jokes with invalid metadata gracefully', () => {
      const invalidJoke = {
        ...mockJoke,
        style: 'invalid-style' as any,
        format: 'invalid-format' as any
      };
      
      expect(() => {
        render(<JokeCard {...defaultProps} joke={invalidJoke} />);
      }).not.toThrow();
    });
  });
});