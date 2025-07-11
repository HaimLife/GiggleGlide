import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import JokeCard from '../JokeCard';

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

describe('JokeCard Keyboard Navigation and Reduced Motion', () => {
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
    mockIsScreenReaderEnabled.mockResolvedValue(true);
    mockAddEventListener.mockReturnValue({
      remove: jest.fn(),
    });
  });

  describe('Keyboard Navigation Support', () => {
    it('supports keyboard navigation through accessibility actions', async () => {
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

      // Test keyboard accessibility action for like
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
      expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);

      // Test keyboard accessibility action for dislike
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dislike' } });
      expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);

      // Test keyboard accessibility action for neutral
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'neutral' } });
      expect(mockOnSwipeUp).toHaveBeenCalledWith(mockJoke.id);

      // Test keyboard accessibility action for refresh
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
      expect(mockOnPullToRefresh).toHaveBeenCalled();
    });

    it('provides proper keyboard navigation hints in accessibility labels', () => {
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
      expect(card.props.accessibilityHint).toBe('Double tap to hear options, or use swipe gestures');
    });

    it('supports keyboard navigation on accessibility buttons', async () => {
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
        // These buttons should be keyboard accessible via their role and focusable state
        const dislikeButton = getByRole('button', { name: /dislike this joke/i });
        const likeButton = getByRole('button', { name: /like this joke/i });
        const neutralButton = getByRole('button', { name: /mark joke as neutral/i });
        const refreshButton = getByRole('button', { name: /get a new joke/i });

        expect(dislikeButton.props.accessibilityRole).toBe('button');
        expect(likeButton.props.accessibilityRole).toBe('button');
        expect(neutralButton.props.accessibilityRole).toBe('button');
        expect(refreshButton.props.accessibilityRole).toBe('button');

        // Test keyboard activation (Enter/Space simulation via press)
        fireEvent.press(dislikeButton);
        expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);

        fireEvent.press(likeButton);
        expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);

        fireEvent.press(neutralButton);
        expect(mockOnSwipeUp).toHaveBeenCalledWith(mockJoke.id);

        fireEvent.press(refreshButton);
        expect(mockOnPullToRefresh).toHaveBeenCalled();
      });
    });

    it('maintains keyboard focus order through proper button arrangement', async () => {
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
        // Buttons should be in logical order: Dislike, Neutral, Like, Refresh
        const dislikeButton = getByRole('button', { name: /dislike this joke/i });
        const neutralButton = getByRole('button', { name: /mark joke as neutral/i });
        const likeButton = getByRole('button', { name: /like this joke/i });
        const refreshButton = getByRole('button', { name: /get a new joke/i });

        // All buttons should be accessible
        expect(dislikeButton.props.accessible).toBe(true);
        expect(neutralButton.props.accessible).toBe(true);
        expect(likeButton.props.accessible).toBe(true);
        expect(refreshButton.props.accessible).toBe(true);
      });
    });

    it('handles keyboard navigation when some actions are not available', async () => {
      const { getByTestId, queryByRole } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          // onSwipeUp not provided
          // onPullToRefresh not provided
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');
      const actions = card.props.accessibilityActions;

      // Should only have like and dislike actions
      expect(actions).toHaveLength(2);
      expect(actions.find((a: any) => a.name === 'like')).toBeTruthy();
      expect(actions.find((a: any) => a.name === 'dislike')).toBeTruthy();
      expect(actions.find((a: any) => a.name === 'neutral')).toBeFalsy();
      expect(actions.find((a: any) => a.name === 'refresh')).toBeFalsy();

      await waitFor(() => {
        // Corresponding buttons should not be present
        expect(queryByRole('button', { name: /mark joke as neutral/i })).toBeNull();
        expect(queryByRole('button', { name: /get a new joke/i })).toBeNull();
      });
    });
  });

  describe('Reduced Motion Support', () => {
    it('applies reduced motion settings to gesture animations', () => {
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
      
      // The component should render without errors when reduced motion is enabled
      // Actual animation testing would require react-native-reanimated testing utilities
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
      
      // The component should render without errors when reduced motion is disabled
      // Actual animation testing would require react-native-reanimated testing utilities
    });

    it('maintains functionality with reduced motion enabled', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
          reducedMotion={true}
        />
      );

      const card = getByTestId('joke-card');

      // All functionality should still work with reduced motion
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
      expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);

      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dislike' } });
      expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);

      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'neutral' } });
      expect(mockOnSwipeUp).toHaveBeenCalledWith(mockJoke.id);

      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
      expect(mockOnPullToRefresh).toHaveBeenCalled();
    });

    it('shows pull-to-refresh indicator even with reduced motion', () => {
      const { getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
          reducedMotion={true}
        />
      );

      const indicator = getByText('↓ Pull for new joke');
      expect(indicator).toBeTruthy();
    });

    it('shows gesture hints with reduced motion enabled', () => {
      const { getByText } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
          showHints={true}
          reducedMotion={true}
        />
      );

      expect(getByText('← Dislike')).toBeTruthy();
      expect(getByText('Like →')).toBeTruthy();
      expect(getByText('↑ Neutral')).toBeTruthy();
      expect(getByText('↓ New joke')).toBeTruthy();
    });
  });

  describe('Screen Reader State Changes', () => {
    it('responds to screen reader state changes', async () => {
      let eventListener: ((enabled: boolean) => void) | undefined;
      
      mockAddEventListener.mockImplementation((event, listener) => {
        if (event === 'screenReaderChanged') {
          eventListener = listener;
        }
        return { remove: jest.fn() };
      });

      const { getByTestId, queryByText, rerender } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          onPullToRefresh={mockOnPullToRefresh}
          isActive={true}
        />
      );

      // Initially screen reader enabled
      expect(queryByText('👎 Dislike')).toBeTruthy();
      
      // Gesture handler should be disabled
      const gestureHandler = getByTestId('pan-gesture-handler');
      expect(gestureHandler.props.enabled).toBe(false);

      // Simulate screen reader being disabled
      if (eventListener) {
        act(() => {
          eventListener!(false);
        });
      }

      // Wait for state update
      await waitFor(() => {
        // Accessibility buttons should be hidden
        expect(queryByText('👎 Dislike')).toBeNull();
        
        // Gesture handler should be enabled
        expect(gestureHandler.props.enabled).toBe(true);
      });
    });

    it('cleans up event listener on unmount', () => {
      const mockRemove = jest.fn();
      mockAddEventListener.mockReturnValue({
        remove: mockRemove,
      });

      const { unmount } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
        />
      );

      unmount();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  describe('Complex Interaction Scenarios', () => {
    it('handles rapid keyboard actions gracefully', async () => {
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

      // Rapid fire multiple actions
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'like' } });
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'dislike' } });
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'neutral' } });
      fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });

      // All actions should be called
      expect(mockOnSwipeRight).toHaveBeenCalledWith(mockJoke.id);
      expect(mockOnSwipeLeft).toHaveBeenCalledWith(mockJoke.id);
      expect(mockOnSwipeUp).toHaveBeenCalledWith(mockJoke.id);
      expect(mockOnPullToRefresh).toHaveBeenCalled();
    });

    it('handles keyboard navigation when card becomes inactive', async () => {
      const { getByTestId, rerender } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const card = getByTestId('joke-card');

      // Initially should have accessibility actions
      expect(card.props.accessibilityActions.length).toBeGreaterThan(0);

      // Card becomes inactive
      rerender(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={false}
        />
      );

      // Should no longer have accessibility actions
      expect(card.props.accessibilityActions).toHaveLength(0);
      expect(card.props.accessibilityLabel).toContain('Inactive joke card');
    });

    it('maintains keyboard navigation during loading and error states', () => {
      // Loading state
      const { getByRole, rerender } = render(
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
      expect(loadingCard.props.accessibilityRole).toBe('text');

      // Error state
      rerender(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          isActive={true}
          error="Network error"
        />
      );

      const errorCard = getByRole('alert');
      expect(errorCard.props.accessible).toBe(true);
      expect(errorCard.props.accessibilityRole).toBe('alert');
    });
  });
});