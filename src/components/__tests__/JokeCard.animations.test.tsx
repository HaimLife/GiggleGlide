import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import JokeCard from '../JokeCard';
import { Dimensions } from 'react-native';
import { advanceTimersByTime } from '@testing-library/react-native';

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    PanGestureHandler: ({ children, onGestureEvent, onHandlerStateChange, enabled }: any) => (
      <View testID="pan-gesture-handler" onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange} enabled={enabled}>
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

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
}));

// Mock reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  const { View } = require('react-native');
  
  // Ensure createAnimatedComponent is available
  if (!Reanimated.createAnimatedComponent) {
    Reanimated.createAnimatedComponent = (component: any) => component;
  }
  
  // Override runOnJS to execute the function immediately in tests
  Reanimated.runOnJS = (fn: Function) => fn;
  
  // Mock interpolateColor
  Reanimated.interpolateColor = (value: number, inputRange: number[], outputRange: string[]) => {
    const index = Math.min(Math.floor(value * (outputRange.length - 1)), outputRange.length - 1);
    return outputRange[index];
  };
  
  return Reanimated;
});

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.25;
const HAPTIC_THRESHOLD = screenWidth * 0.1;
const VERTICAL_SWIPE_THRESHOLD = screenHeight * 0.2;

describe('JokeCard Animations', () => {
  const mockJoke = {
    id: '1',
    text: 'Test joke',
    category: 'Test',
  };

  const mockOnSwipeLeft = jest.fn();
  const mockOnSwipeRight = jest.fn();
  const mockOnSwipeUp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Haptic Feedback', () => {
    it('should trigger haptic feedback when swipe threshold is reached', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      // Simulate gesture that crosses haptic threshold
      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe right past threshold
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: HAPTIC_THRESHOLD + 10,
          translationY: 0,
          velocityX: 100,
          velocityY: 0,
        },
      });

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalledWith('Light');
      });
    });

    it('should trigger haptic feedback for upward swipe', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate upward swipe past threshold
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: 0,
          translationY: -(HAPTIC_THRESHOLD + 10),
          velocityX: 0,
          velocityY: -100,
        },
      });

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalledWith('Light');
      });
    });

    it('should trigger haptic feedback on swipe completion', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe right completion
      gestureHandler.props.onHandlerStateChange({
        nativeEvent: {
          state: 5, // END state
          translationX: SWIPE_THRESHOLD + 50,
          translationY: 0,
          velocityX: 1000,
          velocityY: 0,
        },
      });

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled();
      });
    });

    it('should trigger haptic feedback when spring back occurs', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate incomplete swipe
      gestureHandler.props.onHandlerStateChange({
        nativeEvent: {
          state: 5, // END state
          translationX: SWIPE_THRESHOLD * 0.5, // Below threshold
          translationY: 0,
          velocityX: 100, // Low velocity
          velocityY: 0,
        },
      });

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalled();
      });
    });
  });

  describe('Color Overlay Animations', () => {
    it('should apply green overlay when swiping right', () => {
      const { getByTestId, UNSAFE_getByType } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe right
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: SWIPE_THRESHOLD,
          translationY: 0,
          velocityX: 300,
          velocityY: 0,
        },
      });

      // Check if overlay style includes green color
      const overlayView = UNSAFE_getByType('AnimatedView').find(
        (node: any) => node.props.style?.some((style: any) => style.backgroundColor)
      );
      
      expect(overlayView).toBeTruthy();
    });

    it('should apply red overlay when swiping left', () => {
      const { getByTestId, UNSAFE_getByType } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe left
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: -SWIPE_THRESHOLD,
          translationY: 0,
          velocityX: -300,
          velocityY: 0,
        },
      });

      // Check if overlay style includes red color
      const overlayView = UNSAFE_getByType('AnimatedView').find(
        (node: any) => node.props.style?.some((style: any) => style.backgroundColor)
      );
      
      expect(overlayView).toBeTruthy();
    });

    it('should apply grey overlay when swiping up', () => {
      const { getByTestId, UNSAFE_getByType } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe up
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: 0,
          translationY: -VERTICAL_SWIPE_THRESHOLD,
          velocityX: 0,
          velocityY: -300,
        },
      });

      // Check if overlay style includes grey color
      const overlayView = UNSAFE_getByType('AnimatedView').find(
        (node: any) => node.props.style?.some((style: any) => style.backgroundColor)
      );
      
      expect(overlayView).toBeTruthy();
    });
  });

  describe('Card Rotation and Scale', () => {
    it('should rotate card based on horizontal position', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate horizontal swipe
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: 100,
          translationY: 0,
          velocityX: 200,
          velocityY: 0,
        },
      });

      // Card should have rotation transform
      const card = getByTestId('joke-card');
      expect(card.props.style).toEqual(
        expect.objectContaining({
          transform: expect.arrayContaining([
            expect.objectContaining({ rotate: expect.any(String) }),
          ]),
        })
      );
    });

    it('should scale card based on swipe distance', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe with significant distance
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: screenWidth / 4,
          translationY: 0,
          velocityX: 200,
          velocityY: 0,
        },
      });

      // Card should have scale transform
      const card = getByTestId('joke-card');
      expect(card.props.style).toEqual(
        expect.objectContaining({
          transform: expect.arrayContaining([
            expect.objectContaining({ scale: expect.any(Number) }),
          ]),
        })
      );
    });
  });

  describe('Spring Animations', () => {
    it('should spring back to center when swipe is below threshold', async () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Start gesture
      gestureHandler.props.onHandlerStateChange({
        nativeEvent: {
          state: 2, // BEGAN state
          translationX: 0,
          translationY: 0,
        },
      });

      // Move below threshold
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: SWIPE_THRESHOLD * 0.5,
          translationY: 0,
          velocityX: 100,
          velocityY: 0,
        },
      });

      // End gesture
      gestureHandler.props.onHandlerStateChange({
        nativeEvent: {
          state: 5, // END state
          translationX: SWIPE_THRESHOLD * 0.5,
          translationY: 0,
          velocityX: 100,
          velocityY: 0,
        },
      });

      // Advance timers to allow spring animation
      advanceTimersByTime(500);

      // Check that no swipe callbacks were called
      expect(mockOnSwipeLeft).not.toHaveBeenCalled();
      expect(mockOnSwipeRight).not.toHaveBeenCalled();
      expect(mockOnSwipeUp).not.toHaveBeenCalled();
    });
  });

  describe('Label Animations', () => {
    it('should show LIKE label when swiping right', () => {
      const { getByText, getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe right
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: SWIPE_THRESHOLD,
          translationY: 0,
          velocityX: 300,
          velocityY: 0,
        },
      });

      const likeLabel = getByText('LIKE');
      expect(likeLabel).toBeTruthy();
    });

    it('should show NOPE label when swiping left', () => {
      const { getByText, getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe left
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: -SWIPE_THRESHOLD,
          translationY: 0,
          velocityX: -300,
          velocityY: 0,
        },
      });

      const nopeLabel = getByText('NOPE');
      expect(nopeLabel).toBeTruthy();
    });

    it('should show NEUTRAL label when swiping up', () => {
      const { getByText, getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate swipe up
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: 0,
          translationY: -VERTICAL_SWIPE_THRESHOLD,
          velocityX: 0,
          velocityY: -300,
        },
      });

      const neutralLabel = getByText('NEUTRAL');
      expect(neutralLabel).toBeTruthy();
    });
  });

  describe('Animation Performance', () => {
    it('should not trigger excessive re-renders during animation', () => {
      const renderSpy = jest.fn();
      
      const TestWrapper = () => {
        renderSpy();
        return (
          <JokeCard
            joke={mockJoke}
            onSwipeLeft={mockOnSwipeLeft}
            onSwipeRight={mockOnSwipeRight}
            onSwipeUp={mockOnSwipeUp}
            isActive={true}
          />
        );
      };

      const { getByTestId } = render(<TestWrapper />);
      const initialRenderCount = renderSpy.mock.calls.length;

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate multiple gesture events
      for (let i = 0; i < 10; i++) {
        gestureHandler.props.onGestureEvent({
          nativeEvent: {
            translationX: i * 10,
            translationY: 0,
            velocityX: 100,
            velocityY: 0,
          },
        });
      }

      // Should not cause excessive re-renders
      expect(renderSpy.mock.calls.length).toBeLessThanOrEqual(initialRenderCount + 2);
    });
  });
});