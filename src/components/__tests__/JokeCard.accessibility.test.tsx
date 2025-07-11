import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import JokeCard, { GestureHints } from '../JokeCard';

// Mock the LinearGradient component
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Create separate mocks for easier testing
const mockIsScreenReaderEnabled = jest.fn();
const mockAddEventListener = jest.fn();
const mockAnnounceForAccessibility = jest.fn();
const mockSetAccessibilityFocus = jest.fn();
const mockFindNodeHandle = jest.fn(() => 123);

// Mock AccessibilityInfo module
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const MockedAccessibilityInfo = {
    isScreenReaderEnabled: mockIsScreenReaderEnabled,
    addEventListener: mockAddEventListener,
    announceForAccessibility: mockAnnounceForAccessibility,
    setAccessibilityFocus: mockSetAccessibilityFocus,
  };
  
  return {
    ...RN,
    AccessibilityInfo: MockedAccessibilityInfo,
    findNodeHandle: mockFindNodeHandle,
  };
});

describe('JokeCard Accessibility', () => {
  const mockJoke = {
    id: '1',
    text: 'Why did the chicken cross the road? To get to the other side!',
    category: 'Classic',
  };

  const mockOnSwipeLeft = jest.fn();
  const mockOnSwipeRight = jest.fn();
  const mockOnSwipeUp = jest.fn();
  const mockOnPullToRefresh = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsScreenReaderEnabled.mockResolvedValue(false);
    mockAddEventListener.mockReturnValue({
      remove: jest.fn(),
    });
  });

  describe('Screen Reader Detection', () => {
    it('detects when screen reader is enabled', async () => {
      mockIsScreenReaderEnabled.mockResolvedValue(true);

      const { getByTestId, getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      await waitFor(() => {
        expect(mockIsScreenReaderEnabled).toHaveBeenCalled();
      });

      // Should show accessibility buttons when screen reader is enabled
      await waitFor(() => {
        expect(getByText('👎 Dislike')).toBeTruthy();
        expect(getByText('👍 Like')).toBeTruthy();
        expect(getByText('➖ Neutral')).toBeTruthy();
        expect(getByText('🔄 New Joke')).toBeTruthy();
      });

      // Gesture handler should be disabled when screen reader is enabled
      const gestureHandler = getByTestId('pan-gesture-handler');
      expect(gestureHandler.props.enabled).toBe(false);
    });

    it('hides accessibility buttons when screen reader is disabled', async () => {
      mockIsScreenReaderEnabled.mockResolvedValue(false);

      const { queryByText, getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      await waitFor(() => {
        expect(queryByText('👎 Dislike')).toBeNull();
        expect(queryByText('👍 Like')).toBeNull();
        expect(queryByText('➖ Neutral')).toBeNull();
        expect(queryByText('🔄 New Joke')).toBeNull();
      });

      // Gesture handler should be enabled when screen reader is disabled
      const gestureHandler = getByTestId('pan-gesture-handler');
      expect(gestureHandler.props.enabled).toBe(true);
    });
  });

  describe('Accessibility Labels and Roles', () => {
    it('has proper accessibility labels for active card', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');
      expect(card.props.accessible).toBe(true);
      expect(card.props.accessibilityRole).toBe('button');
      expect(card.props.accessibilityLabel).toContain(mockJoke.text);
      expect(card.props.accessibilityLabel).toContain(mockJoke.category);
      expect(card.props.accessibilityLabel).toContain('Swipe right to like, left to dislike, up for neutral');
      expect(card.props.accessibilityHint).toBe('Double tap to hear options, or use swipe gestures');
    });

    it('has proper accessibility labels for inactive card', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={false}
        />
      );

      const card = getByTestId('joke-card');
      expect(card.props.accessibilityLabel).toContain('Inactive joke card');
      expect(card.props.accessibilityHint).toBeUndefined();
    });

    it('has proper accessibility labels for loading state', () => {
      const { getByRole } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          isLoading={true}
        />
      );

      const loadingCard = getByRole('text');
      expect(loadingCard.props.accessible).toBe(true);
      expect(loadingCard.props.accessibilityLabel).toBe('Loading a new joke, please wait');
      expect(loadingCard.props.accessibilityState.busy).toBe(true);
    });

    it('has proper accessibility labels for error state', () => {
      const errorMessage = 'Network error occurred';
      
      const { getByRole } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          error={errorMessage}
        />
      );

      const errorCard = getByRole('alert');
      expect(errorCard.props.accessible).toBe(true);
      expect(errorCard.props.accessibilityLabel).toBe(`Error occurred: ${errorMessage}. Please try again.`);
    });
  });

  describe('Accessibility Actions', () => {
    beforeEach(() => {
      mockIsScreenReaderEnabled.mockResolvedValue(true);
    });

    it('includes all accessibility actions for active card with all handlers', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');
      const actions = card.props.accessibilityActions;
      
      expect(actions).toHaveLength(4);
      expect(actions.find((a: any) => a.name === 'like')).toBeTruthy();
      expect(actions.find((a: any) => a.name === 'dislike')).toBeTruthy();
      expect(actions.find((a: any) => a.name === 'neutral')).toBeTruthy();
      expect(actions.find((a: any) => a.name === 'refresh')).toBeTruthy();
    });

    it('excludes neutral action when onSwipeUp is not provided', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');
      const actions = card.props.accessibilityActions;
      
      expect(actions.find((a: any) => a.name === 'neutral')).toBeFalsy();
    });

    it('excludes refresh action when onPullToRefresh is not provided', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');
      const actions = card.props.accessibilityActions;
      
      expect(actions.find((a: any) => a.name === 'refresh')).toBeFalsy();
    });

    it('triggers correct callbacks for accessibility actions', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');

      // Test like action
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
      expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);

      // Test dislike action
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dislike' } });
      expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);

      // Test neutral action
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'neutral' } });
      expect(mockOnSwipeUp).toHaveBeenCalledWith(mockJoke.id);

      // Test refresh action
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
      expect(mockOnPullToRefresh).toHaveBeenCalled();
    });
  });

  describe('Accessibility Button Tests', () => {
    beforeEach(() => {
      mockIsScreenReaderEnabled.mockResolvedValue(true);
    });

    it('renders accessibility buttons with proper labels and roles', async () => {
      const { getByRole } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      await waitFor(() => {
        const dislikeButton = getByRole('button', { name: /dislike this joke/i });
        expect(dislikeButton.props.accessibilityHint).toBe('Marks this joke as disliked and shows the next one');

        const likeButton = getByRole('button', { name: /like this joke/i });
        expect(likeButton.props.accessibilityHint).toBe('Marks this joke as liked and shows the next one');

        const neutralButton = getByRole('button', { name: /mark joke as neutral/i });
        expect(neutralButton.props.accessibilityHint).toBe('Marks this joke as neutral and shows the next one');

        const refreshButton = getByRole('button', { name: /get a new joke/i });
        expect(refreshButton.props.accessibilityHint).toBe('Loads a completely new joke');
      });
    });

    it('triggers correct callbacks when accessibility buttons are pressed', async () => {
      const { getByRole } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      await waitFor(() => {
        const dislikeButton = getByRole('button', { name: /dislike this joke/i });
        fireEvent.press(dislikeButton);
        expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);

        const likeButton = getByRole('button', { name: /like this joke/i });
        fireEvent.press(likeButton);
        expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);

        const neutralButton = getByRole('button', { name: /mark joke as neutral/i });
        fireEvent.press(neutralButton);
        expect(mockOnSwipeUp).toHaveBeenCalledWith(mockJoke.id);

        const refreshButton = getByRole('button', { name: /get a new joke/i });
        fireEvent.press(refreshButton);
        expect(mockOnPullToRefresh).toHaveBeenCalled();
      });
    });
  });

  describe('Screen Reader Announcements', () => {
    beforeEach(() => {
      mockIsScreenReaderEnabled.mockResolvedValue(true);
    });

    it('announces actions when performed via accessibility actions', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');

      // Test announcements for each action
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
      expect(mockAnnounceForAccessibility).toHaveBeenCalledWith(
        expect.stringContaining('Liked joke: Why did the chicken cross the road? To get to the')
      );

      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dislike' } });
      expect(mockAnnounceForAccessibility).toHaveBeenCalledWith(
        expect.stringContaining('Disliked joke: Why did the chicken cross the road? To get to the')
      );

      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'neutral' } });
      expect(mockAnnounceForAccessibility).toHaveBeenCalledWith(
        expect.stringContaining('Marked as neutral joke: Why did the chicken cross the road? To get to the')
      );

      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
      expect(mockAnnounceForAccessibility).toHaveBeenCalledWith(
        expect.stringContaining('Refreshing joke: Why did the chicken cross the road? To get to the')
      );
    });

    it('does not announce when screen reader is disabled', async () => {
      mockIsScreenReaderEnabled.mockResolvedValue(false);

      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      await waitFor(() => {
        const card = getByTestId('joke-card');
        fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
        expect(mockAnnounceForAccessibility).not.toHaveBeenCalled();
      });
    });
  });

  describe('Focus Management', () => {
    it('sets focus to card when it becomes active with screen reader enabled', async () => {
      mockIsScreenReaderEnabled.mockResolvedValue(true);

      const { rerender } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={false}
        />
      );

      // Card becomes active
      rerender(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      await waitFor(() => {
        expect(mockSetAccessibilityFocus).toHaveBeenCalledWith(123);
      }, { timeout: 200 });
    });

    it('does not set focus when screen reader is disabled', async () => {
      mockIsScreenReaderEnabled.mockResolvedValue(false);

      const { rerender } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={false}
        />
      );

      rerender(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      await waitFor(() => {
        expect(mockSetAccessibilityFocus).not.toHaveBeenCalled();
      });
    });
  });

  describe('Reduced Motion Support', () => {
    it('respects reduced motion preference for animations', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          reducedMotion={true}
        />
      );

      const card = getByTestId('joke-card');
      expect(card).toBeTruthy();
      // Note: Testing the actual animation behavior would require integration with 
      // react-native-reanimated's testing utilities
    });

    it('uses normal animations when reduced motion is disabled', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          reducedMotion={false}
        />
      );

      const card = getByTestId('joke-card');
      expect(card).toBeTruthy();
      // Note: Testing the actual animation behavior would require integration with 
      // react-native-reanimated's testing utilities
    });
  });

  describe('Gesture Hints Component', () => {
    it('renders hints when visible', () => {
      const { getByText } = render(
        <GestureHints visible={true} onPullToRefresh={true} />
      );

      expect(getByText('← Swipe left to dislike')).toBeTruthy();
      expect(getByText('Swipe right to like →')).toBeTruthy();
      expect(getByText('↑ Swipe up for neutral')).toBeTruthy();
      expect(getByText('↓ Pull down for new joke')).toBeTruthy();
    });

    it('does not render hints when not visible', () => {
      const { queryByText } = render(
        <GestureHints visible={false} onPullToRefresh={true} />
      );

      expect(queryByText('← Swipe left to dislike')).toBeNull();
    });

    it('does not render pull-to-refresh hint when not enabled', () => {
      const { queryByText } = render(
        <GestureHints visible={true} onPullToRefresh={false} />
      );

      expect(queryByText('↓ Pull down for new joke')).toBeNull();
    });

    it('has proper accessibility properties for hints overlay', () => {
      const { getByText } = render(
        <GestureHints visible={true} onPullToRefresh={true} />
      );

      const container = getByText('← Swipe left to dislike').parent?.parent;
      expect(container?.props.pointerEvents).toBe('none');
    });
  });

  describe('Accessibility Element Exclusions', () => {
    it('excludes decorative elements from accessibility tree', () => {
      const { getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          showHints={true}
        />
      );

      // These elements should be marked as not accessible
      const categoryElement = getByText(mockJoke.category.toUpperCase());
      const jokeTextElement = getByText(mockJoke.text);
      
      expect(categoryElement.props.accessible).toBe(false);
      expect(jokeTextElement.props.accessible).toBe(false);
    });

    it('excludes animated overlay elements from accessibility tree', () => {
      const { getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      const likeLabel = getByText('LIKE');
      const nopeLabel = getByText('NOPE');
      const neutralLabel = getByText('NEUTRAL');

      // These should be inaccessible as they're just visual feedback
      expect(likeLabel.parent?.parent?.props.accessible).toBe(false);
      expect(nopeLabel.parent?.parent?.props.accessible).toBe(false);
      expect(neutralLabel.parent?.parent?.props.accessible).toBe(false);
    });
  });

  describe('Pull-to-Refresh Accessibility', () => {
    it('includes pull-to-refresh in accessibility actions when enabled', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');
      const actions = card.props.accessibilityActions;
      
      expect(actions.find((a: any) => a.name === 'refresh' && a.label === 'Get new joke')).toBeTruthy();
    });

    it('shows pull-to-refresh indicator when pull-to-refresh is enabled', () => {
      const { getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      const indicator = getByText('↓ Pull for new joke');
      expect(indicator).toBeTruthy();
      expect(indicator.parent?.props.accessible).toBe(false); // Should be decorative
    });
  });
});