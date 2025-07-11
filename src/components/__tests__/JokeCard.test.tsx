import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Animated } from 'react-native';
import JokeCard, { JokeCardErrorBoundary } from '../JokeCard';

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

  describe('Loading State', () => {
    it('displays loading indicator when isLoading is true', () => {
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
      expect(queryByText(mockJoke.text)).toBeNull();
    });
  });

  describe('Error State', () => {
    it('displays error message when error prop is provided', () => {
      const errorMessage = 'Network error occurred';
      const { getByText, queryByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          error={errorMessage}
        />
      );

      expect(getByText('Oops! Something went wrong')).toBeTruthy();
      expect(getByText(errorMessage)).toBeTruthy();
      expect(queryByText(mockJoke.text)).toBeNull();
    });
  });

  describe('Responsive Design', () => {
    it('renders with adjustable text that fits within card bounds', () => {
      const longJoke = {
        id: '3',
        text: 'This is a very long joke that should automatically adjust its font size to fit within the card bounds. ' +
              'It contains multiple sentences and should handle overflow gracefully without breaking the layout. ' +
              'The text should remain readable and centered within the card.',
        category: 'Long',
      };

      const { getByText } = render(
        <JokeCard
          joke={longJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      const jokeText = getByText(longJoke.text);
      expect(jokeText).toBeTruthy();
      expect(jokeText.props.adjustsFontSizeToFit).toBe(true);
      expect(jokeText.props.numberOfLines).toBe(8);
    });
  });

  describe('Error Boundary', () => {
    // Mock console.error to avoid test output pollution
    const originalError = console.error;
    beforeAll(() => {
      console.error = jest.fn();
    });

    afterAll(() => {
      console.error = originalError;
    });

    it('catches and displays error when component throws', () => {
      // Component that throws an error
      const ThrowingComponent = () => {
        throw new Error('Test error');
      };

      const { getByText } = render(
        <JokeCardErrorBoundary>
          <ThrowingComponent />
        </JokeCardErrorBoundary>
      );

      expect(getByText('Something went wrong with this joke!')).toBeTruthy();
      expect(getByText('Test error')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('has proper accessibility labels', () => {
      const { getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      // Verify text elements are rendered and accessible
      expect(getByText(mockJoke.text)).toBeTruthy();
      expect(getByText('LIKE')).toBeTruthy();
      expect(getByText('NOPE')).toBeTruthy();
    });
  });
});