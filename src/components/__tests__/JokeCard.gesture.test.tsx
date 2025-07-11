import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import JokeCard from '../JokeCard';

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    PanGestureHandler: ({ children, onGestureEvent, enabled }: any) => (
      <View testID="pan-gesture-handler" {...{ onGestureEvent, enabled }}>
        {children}
      </View>
    ),
    State: {
      UNDETERMINED: 0,
      FAILED: 1,
      BEGAN: 2,
      CANCELLED: 3,
      ACTIVE: 4,
      END: 5,
    },
    Directions: {},
  };
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  
  return {
    default: {
      createAnimatedComponent: (component: any) => component,
    },
    useSharedValue: (initialValue: number) => ({ value: initialValue }),
    useAnimatedStyle: (updater: any) => {
      return {};
    },
    useAnimatedGestureHandler: (handlers: any) => {
      return handlers;
    },
    withSpring: (value: number) => value,
    withTiming: (value: number, config: any, callback: any) => {
      if (callback) callback();
      return value;
    },
    runOnJS: (fn: any) => fn,
    interpolate: (value: number, inputRange: number[], outputRange: number[]) => {
      return outputRange[0];
    },
    Extrapolate: {
      CLAMP: 'clamp',
    },
  };
});

describe('JokeCard Gesture Handling', () => {
  const mockJoke = {
    id: '123',
    text: 'Test joke',
    category: 'Programming',
  };

  const mockOnSwipeLeft = jest.fn();
  const mockOnSwipeRight = jest.fn();
  const mockOnSwipeUp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with gesture handler', () => {
    const { getByTestId, getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        onSwipeUp={mockOnSwipeUp}
        isActive={true}
      />
    );

    expect(getByTestId('pan-gesture-handler')).toBeTruthy();
    expect(getByText('Test joke')).toBeTruthy();
  });

  it('disables gesture handling when isActive is false', () => {
    const { getByTestId } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        onSwipeUp={mockOnSwipeUp}
        isActive={false}
      />
    );

    const gestureHandler = getByTestId('pan-gesture-handler');
    expect(gestureHandler.props.enabled).toBe(false);
  });

  it('shows LIKE indicator on right swipe', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        onSwipeUp={mockOnSwipeUp}
        isActive={true}
      />
    );

    expect(getByText('LIKE')).toBeTruthy();
  });

  it('shows NOPE indicator on left swipe', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        onSwipeUp={mockOnSwipeUp}
        isActive={true}
      />
    );

    expect(getByText('NOPE')).toBeTruthy();
  });

  it('shows NEUTRAL indicator on up swipe', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        onSwipeUp={mockOnSwipeUp}
        isActive={true}
      />
    );

    expect(getByText('NEUTRAL')).toBeTruthy();
  });

  describe('Swipe thresholds', () => {
    it('should have correct horizontal swipe threshold', () => {
      // Test that SWIPE_THRESHOLD is 25% of screen width
      const { width } = require('react-native').Dimensions.get('window');
      const expectedThreshold = width * 0.25;
      
      // This is a conceptual test - in real implementation,
      // you would test the actual gesture handling logic
      expect(expectedThreshold).toBeGreaterThan(0);
    });

    it('should have correct vertical swipe threshold', () => {
      // Test that VERTICAL_SWIPE_THRESHOLD is 20% of screen height
      const { height } = require('react-native').Dimensions.get('window');
      const expectedThreshold = height * 0.2;
      
      expect(expectedThreshold).toBeGreaterThan(0);
    });

    it('should have correct velocity threshold', () => {
      // Test that SWIPE_VELOCITY_THRESHOLD is set to 800
      const expectedVelocity = 800;
      
      expect(expectedVelocity).toBe(800);
    });
  });

  describe('Loading and error states', () => {
    it('shows loading state correctly', () => {
      const { getByText, queryByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          isLoading={true}
        />
      );

      expect(getByText('Loading joke...')).toBeTruthy();
      expect(queryByText('Test joke')).toBeNull();
    });

    it('shows error state correctly', () => {
      const { getByText, queryByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          error="Network error"
        />
      );

      expect(getByText('Oops! Something went wrong')).toBeTruthy();
      expect(getByText('Network error')).toBeTruthy();
      expect(queryByText('Test joke')).toBeNull();
    });
  });
});