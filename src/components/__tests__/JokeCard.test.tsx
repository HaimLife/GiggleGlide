import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';
import JokeCard from '../JokeCard';

// Mock the LinearGradient component
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Mock Animated for testing
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Animated.timing = jest.fn(() => ({
    start: jest.fn((cb) => cb && cb()),
  }));
  RN.Animated.spring = jest.fn(() => ({
    start: jest.fn((cb) => cb && cb()),
  }));
  return RN;
});

describe('JokeCard', () => {
  const mockJoke = {
    id: '1',
    text: 'Why did the chicken cross the road? To get to the other side!',
    category: 'Classic',
  };

  const mockOnSwipeLeft = jest.fn();
  const mockOnSwipeRight = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with joke data', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={true}
      />
    );

    expect(getByText(mockJoke.text)).toBeTruthy();
    expect(getByText(mockJoke.category.toUpperCase())).toBeTruthy();
  });

  it('renders without category when not provided', () => {
    const jokeWithoutCategory = {
      id: '2',
      text: 'Another joke',
    };

    const { getByText, queryByText } = render(
      <JokeCard
        joke={jokeWithoutCategory}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={true}
      />
    );

    expect(getByText(jokeWithoutCategory.text)).toBeTruthy();
    expect(queryByText('CLASSIC')).toBeNull();
  });

  it('shows LIKE and NOPE indicators', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={true}
      />
    );

    expect(getByText('LIKE')).toBeTruthy();
    expect(getByText('NOPE')).toBeTruthy();
  });

  it('does not respond to gestures when not active', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={false}
      />
    );

    const card = getByText(mockJoke.text).parent;
    
    // Simulate pan gesture
    fireEvent(card, 'responderGrant');
    fireEvent(card, 'responderMove', { 
      nativeEvent: {},
      gestureState: { dx: 100, dy: 0 }
    });
    fireEvent(card, 'responderRelease', {
      nativeEvent: {},
      gestureState: { dx: 100, dy: 0 }
    });

    // Should not trigger any swipe callbacks when not active
    expect(mockOnSwipeLeft).not.toHaveBeenCalled();
    expect(mockOnSwipeRight).not.toHaveBeenCalled();
  });

  it('handles swipe right gesture', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={true}
      />
    );

    const card = getByText(mockJoke.text).parent;
    
    // Simulate swipe right
    fireEvent(card, 'responderGrant');
    fireEvent(card, 'responderMove', { 
      nativeEvent: {},
      gestureState: { dx: 200, dy: 0 } // More than SWIPE_THRESHOLD
    });
    fireEvent(card, 'responderRelease', {
      nativeEvent: {},
      gestureState: { dx: 200, dy: 0 }
    });

    // Wait for animation to complete
    setTimeout(() => {
      expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);
      expect(mockOnSwipeLeft).not.toHaveBeenCalled();
    }, 300);
  });

  it('handles swipe left gesture', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={true}
      />
    );

    const card = getByText(mockJoke.text).parent;
    
    // Simulate swipe left
    fireEvent(card, 'responderGrant');
    fireEvent(card, 'responderMove', { 
      nativeEvent: {},
      gestureState: { dx: -200, dy: 0 } // Less than negative SWIPE_THRESHOLD
    });
    fireEvent(card, 'responderRelease', {
      nativeEvent: {},
      gestureState: { dx: -200, dy: 0 }
    });

    // Wait for animation to complete
    setTimeout(() => {
      expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);
      expect(mockOnSwipeRight).not.toHaveBeenCalled();
    }, 300);
  });

  it('springs back when swipe is not far enough', () => {
    const { getByText } = render(
      <JokeCard
        joke={mockJoke}
        onSwipeLeft={mockOnSwipeLeft}
        onSwipeRight={mockOnSwipeRight}
        isActive={true}
      />
    );

    const card = getByText(mockJoke.text).parent;
    
    // Simulate small swipe
    fireEvent(card, 'responderGrant');
    fireEvent(card, 'responderMove', { 
      nativeEvent: {},
      gestureState: { dx: 50, dy: 0 } // Less than SWIPE_THRESHOLD
    });
    fireEvent(card, 'responderRelease', {
      nativeEvent: {},
      gestureState: { dx: 50, dy: 0 }
    });

    // Should spring back without calling any callbacks
    expect(Animated.spring).toHaveBeenCalled();
    expect(mockOnSwipeLeft).not.toHaveBeenCalled();
    expect(mockOnSwipeRight).not.toHaveBeenCalled();
  });
});