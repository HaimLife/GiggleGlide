import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import JokeCard from '../JokeCard';
import { Dimensions } from 'react-native';

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

// Performance-focused reanimated mock
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  const { View } = require('react-native');
  
  // Ensure createAnimatedComponent is available
  if (!Reanimated.createAnimatedComponent) {
    Reanimated.createAnimatedComponent = (component: any) => component;
  }
  
  // Mock performance metrics
  let gestureUpdateCount = 0;
  let animationStartTime = 0;
  let lastFrameTime = 0;
  
  // Override runOnJS to execute the function immediately in tests
  Reanimated.runOnJS = (fn: Function) => {
    const wrappedFn = (...args: any[]) => {
      const now = performance.now();
      if (animationStartTime === 0) animationStartTime = now;
      lastFrameTime = now;
      return fn(...args);
    };
    return wrappedFn;
  };
  
  // Mock useAnimatedStyle with performance tracking
  const originalUseAnimatedStyle = Reanimated.useAnimatedStyle;
  Reanimated.useAnimatedStyle = (styleFunction: any, deps?: any[]) => {
    return originalUseAnimatedStyle(() => {
      const start = performance.now();
      const result = styleFunction();
      const end = performance.now();
      
      // Track style calculation time (should be < 1ms for 60fps)
      const calculationTime = end - start;
      if (calculationTime > 1) {
        console.warn(`Style calculation took ${calculationTime}ms (should be < 1ms for 60fps)`);
      }
      
      return result;
    }, deps);
  };
  
  // Mock useAnimatedGestureHandler with performance tracking
  const originalUseAnimatedGestureHandler = Reanimated.useAnimatedGestureHandler;
  Reanimated.useAnimatedGestureHandler = (handlers: any) => {
    return originalUseAnimatedGestureHandler({
      ...handlers,
      onActive: (event: any, ctx: any) => {
        gestureUpdateCount++;
        const start = performance.now();
        const result = handlers.onActive?.(event, ctx);
        const end = performance.now();
        
        // Track gesture handling time (should be < 1ms for 60fps)
        const handlingTime = end - start;
        if (handlingTime > 1) {
          console.warn(`Gesture handling took ${handlingTime}ms (should be < 1ms for 60fps)`);
        }
        
        return result;
      },
    });
  };
  
  // Add performance utility functions
  Reanimated.getPerformanceMetrics = () => ({
    gestureUpdateCount,
    totalAnimationTime: lastFrameTime - animationStartTime,
    averageFrameTime: gestureUpdateCount > 0 ? (lastFrameTime - animationStartTime) / gestureUpdateCount : 0,
  });
  
  Reanimated.resetPerformanceMetrics = () => {
    gestureUpdateCount = 0;
    animationStartTime = 0;
    lastFrameTime = 0;
  };
  
  return Reanimated;
});

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.25;
const HAPTIC_THRESHOLD = screenWidth * 0.1;
const VERTICAL_SWIPE_THRESHOLD = screenHeight * 0.2;

describe('JokeCard Performance Tests', () => {
  const mockJoke = {
    id: '1',
    text: 'Performance test joke',
    category: 'Test',
  };

  const mockOnSwipeLeft = jest.fn();
  const mockOnSwipeRight = jest.fn();
  const mockOnSwipeUp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // @ts-ignore - accessing mock functions
    require('react-native-reanimated').resetPerformanceMetrics();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('60fps Animation Performance', () => {
    it('should maintain 60fps during gesture tracking', async () => {
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
      const targetFPS = 60;
      const maxFrameTime = 1000 / targetFPS; // 16.67ms for 60fps
      
      // Simulate high-frequency gesture updates (like real gestures)
      const gestureEvents = Array.from({ length: 100 }, (_, i) => ({
        nativeEvent: {
          translationX: (i / 100) * SWIPE_THRESHOLD,
          translationY: 0,
          velocityX: 100,
          velocityY: 0,
        },
      }));

      const startTime = performance.now();
      
      // Simulate rapid gesture updates
      gestureEvents.forEach((event, index) => {
        gestureHandler.props.onGestureEvent(event);
        
        // Simulate frame time by advancing time slightly
        jest.advanceTimersByTime(1);
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageFrameTime = totalTime / gestureEvents.length;

      // Should complete all gesture updates within reasonable time
      expect(averageFrameTime).toBeLessThan(maxFrameTime);
      
      // @ts-ignore - accessing mock functions
      const metrics = require('react-native-reanimated').getPerformanceMetrics();
      expect(metrics.gestureUpdateCount).toBe(gestureEvents.length);
    });

    it('should handle rapid gesture direction changes efficiently', () => {
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
      
      // Simulate rapid direction changes (common in real usage)
      const rapidGestures = [
        { translationX: 50, translationY: 0 },
        { translationX: -30, translationY: 10 },
        { translationX: 80, translationY: -20 },
        { translationX: -60, translationY: 30 },
        { translationX: 100, translationY: -40 },
        { translationX: -90, translationY: 50 },
      ];

      const startTime = performance.now();
      
      rapidGestures.forEach(gesture => {
        gestureHandler.props.onGestureEvent({
          nativeEvent: {
            ...gesture,
            velocityX: gesture.translationX > 0 ? 200 : -200,
            velocityY: gesture.translationY > 0 ? 200 : -200,
          },
        });
      });

      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Should handle rapid changes within 1ms per gesture for 60fps
      expect(processingTime / rapidGestures.length).toBeLessThan(1);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not create memory leaks during animations', () => {
      const { unmount } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      // Simulate component lifecycle
      unmount();
      
      // Should not throw errors or warnings about memory leaks
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should efficiently handle multiple simultaneous animations', async () => {
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
          state: 2, // BEGAN
          translationX: 0,
          translationY: 0,
        },
      });

      // Trigger multiple overlapping animations
      gestureHandler.props.onGestureEvent({
        nativeEvent: {
          translationX: SWIPE_THRESHOLD * 0.8, // Near threshold
          translationY: 0,
          velocityX: 300,
          velocityY: 0,
        },
      });

      // Should handle overlapping scale, rotation, and opacity animations
      // without performance degradation
      expect(() => {
        jest.advanceTimersByTime(100);
      }).not.toThrow();
    });
  });

  describe('Haptic Feedback Performance', () => {
    it('should throttle haptic feedback to prevent excessive calls', async () => {
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
      
      // Simulate rapid gestures that would trigger haptic feedback
      for (let i = 0; i < 10; i++) {
        gestureHandler.props.onGestureEvent({
          nativeEvent: {
            translationX: HAPTIC_THRESHOLD + 10 + (i * 5),
            translationY: 0,
            velocityX: 100,
            velocityY: 0,
          },
        });
      }

      await waitFor(() => {
        // Should only trigger haptic feedback once, not for every gesture update
        expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
      });
    });

    it('should use appropriate haptic intensities for different actions', async () => {
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
      
      // Test threshold haptic (should be Light)
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

      jest.clearAllMocks();

      // Test swipe completion (should be Medium)
      gestureHandler.props.onHandlerStateChange({
        nativeEvent: {
          state: 5, // END
          translationX: SWIPE_THRESHOLD + 50,
          translationY: 0,
          velocityX: 1000,
          velocityY: 0,
        },
      });

      await waitFor(() => {
        expect(Haptics.impactAsync).toHaveBeenCalledWith('Medium');
      });
    });
  });

  describe('Animation Interpolation Performance', () => {
    it('should efficiently calculate overlay opacity interpolations', () => {
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
      
      // Test multiple interpolation calculations
      const testValues = [
        { translationX: 0, translationY: 0 },
        { translationX: SWIPE_THRESHOLD * 0.25, translationY: 0 },
        { translationX: SWIPE_THRESHOLD * 0.5, translationY: 0 },
        { translationX: SWIPE_THRESHOLD * 0.75, translationY: 0 },
        { translationX: SWIPE_THRESHOLD, translationY: 0 },
      ];

      const startTime = performance.now();
      
      testValues.forEach(values => {
        gestureHandler.props.onGestureEvent({
          nativeEvent: {
            ...values,
            velocityX: 100,
            velocityY: 0,
          },
        });
      });

      const endTime = performance.now();
      const interpolationTime = endTime - startTime;
      
      // Should complete all interpolations within 1ms for smooth performance
      expect(interpolationTime).toBeLessThan(1);
    });

    it('should handle edge cases in interpolation without performance issues', () => {
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
      
      // Test edge cases that might cause performance issues
      const edgeCases = [
        { translationX: 0, translationY: 0 }, // Zero values
        { translationX: screenWidth * 2, translationY: 0 }, // Very large values
        { translationX: -screenWidth * 2, translationY: 0 }, // Very large negative values
        { translationX: 0.1, translationY: 0.1 }, // Very small values
        { translationX: Number.MAX_SAFE_INTEGER, translationY: 0 }, // Extreme values
      ];

      edgeCases.forEach(testCase => {
        expect(() => {
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              ...testCase,
              velocityX: 100,
              velocityY: 0,
            },
          });
        }).not.toThrow();
      });
    });
  });

  describe('UI Thread Performance', () => {
    it('should not block the UI thread during animations', () => {
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
      
      // Simulate continuous gesture updates
      const continuousUpdates = () => {
        for (let i = 0; i < 60; i++) { // Simulate 60 updates (1 second at 60fps)
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              translationX: Math.sin(i * 0.1) * SWIPE_THRESHOLD,
              translationY: Math.cos(i * 0.1) * 20,
              velocityX: Math.sin(i * 0.1) * 200,
              velocityY: Math.cos(i * 0.1) * 50,
            },
          });
        }
      };

      // Should complete without blocking
      const startTime = performance.now();
      continuousUpdates();
      const endTime = performance.now();
      
      // Should process all updates within a reasonable time (< 16ms for 60fps)
      expect(endTime - startTime).toBeLessThan(16);
    });
  });

  describe('Spring Animation Performance', () => {
    it('should efficiently handle spring-back animations', async () => {
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
      
      // Simulate gesture that triggers spring-back
      gestureHandler.props.onHandlerStateChange({
        nativeEvent: {
          state: 5, // END
          translationX: SWIPE_THRESHOLD * 0.5, // Below threshold
          translationY: 0,
          velocityX: 100, // Low velocity
          velocityY: 0,
        },
      });

      // Spring animation should complete efficiently
      jest.advanceTimersByTime(500);
      
      // Should not cause any performance warnings or errors
      expect(mockOnSwipeLeft).not.toHaveBeenCalled();
      expect(mockOnSwipeRight).not.toHaveBeenCalled();
      expect(mockOnSwipeUp).not.toHaveBeenCalled();
    });
  });
});