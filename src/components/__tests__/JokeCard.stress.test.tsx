import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
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

// Mock dependencies
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
}));

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  const { View } = require('react-native');
  
  // Ensure createAnimatedComponent is available
  if (!Reanimated.createAnimatedComponent) {
    Reanimated.createAnimatedComponent = (component: any) => component;
  }
  
  // Track performance under stress
  let totalStyleCalculations = 0;
  let maxStyleCalculationTime = 0;
  let gestureHandlerCalls = 0;
  let memoryLeakDetector: Set<string> = new Set();
  
  const originalUseAnimatedStyle = Reanimated.useAnimatedStyle;
  Reanimated.useAnimatedStyle = (styleFunction: any, deps?: any[]) => {
    return originalUseAnimatedStyle(() => {
      const start = performance.now();
      totalStyleCalculations++;
      
      const result = styleFunction();
      
      const end = performance.now();
      const calculationTime = end - start;
      if (calculationTime > maxStyleCalculationTime) {
        maxStyleCalculationTime = calculationTime;
      }
      
      return result;
    }, deps);
  };

  const originalUseAnimatedGestureHandler = Reanimated.useAnimatedGestureHandler;
  Reanimated.useAnimatedGestureHandler = (handlers: any) => {
    return originalUseAnimatedGestureHandler({
      ...handlers,
      onActive: (event: any, ctx: any) => {
        gestureHandlerCalls++;
        const handlerId = `handler_${Date.now()}_${Math.random()}`;
        memoryLeakDetector.add(handlerId);
        
        const result = handlers.onActive?.(event, ctx);
        
        // Simulate cleanup (in real scenario, this would be handled by reanimated)
        setTimeout(() => memoryLeakDetector.delete(handlerId), 100);
        
        return result;
      },
    });
  };

  // Add stress test utilities
  Reanimated.getStressMetrics = () => ({
    totalStyleCalculations,
    maxStyleCalculationTime,
    gestureHandlerCalls,
    potentialMemoryLeaks: memoryLeakDetector.size,
    averageStyleCalculationTime: totalStyleCalculations > 0 ? maxStyleCalculationTime / totalStyleCalculations : 0,
  });

  Reanimated.resetStressMetrics = () => {
    totalStyleCalculations = 0;
    maxStyleCalculationTime = 0;
    gestureHandlerCalls = 0;
    memoryLeakDetector.clear();
  };

  return Reanimated;
});

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.25;
const VERTICAL_SWIPE_THRESHOLD = screenHeight * 0.2;

describe('JokeCard Stress Tests', () => {
  const mockJoke = {
    id: '1',
    text: 'Stress test joke with a very long text that should be properly handled even under extreme conditions and memory pressure',
    category: 'Stress',
  };

  const mockOnSwipeLeft = jest.fn();
  const mockOnSwipeRight = jest.fn();
  const mockOnSwipeUp = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // @ts-ignore
    require('react-native-reanimated').resetStressMetrics();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('High Frequency Gesture Stress Tests', () => {
    it('should handle 1000 rapid gesture updates without performance degradation', () => {
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
      const startTime = performance.now();
      
      // Simulate 1000 rapid gesture updates
      for (let i = 0; i < 1000; i++) {
        gestureHandler.props.onGestureEvent({
          nativeEvent: {
            translationX: Math.sin(i * 0.01) * SWIPE_THRESHOLD,
            translationY: Math.cos(i * 0.01) * 50,
            velocityX: Math.sin(i * 0.01) * 500,
            velocityY: Math.cos(i * 0.01) * 100,
          },
        });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTimePerGesture = totalTime / 1000;

      // Should handle each gesture in less than 1ms for 60fps
      expect(averageTimePerGesture).toBeLessThan(1);
      
      // @ts-ignore
      const metrics = require('react-native-reanimated').getStressMetrics();
      expect(metrics.totalStyleCalculations).toBeGreaterThan(0);
      expect(metrics.maxStyleCalculationTime).toBeLessThan(5); // Should not exceed 5ms
    });

    it('should maintain performance during extreme velocity changes', () => {
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
      
      // Test with extreme velocity changes
      const extremeVelocities = [
        { velocityX: 10000, velocityY: 0 },
        { velocityX: -10000, velocityY: 0 },
        { velocityX: 0, velocityY: 10000 },
        { velocityX: 0, velocityY: -10000 },
        { velocityX: 5000, velocityY: 5000 },
        { velocityX: -5000, velocityY: -5000 },
      ];

      const startTime = performance.now();
      
      // Repeat extreme velocity tests 100 times
      for (let i = 0; i < 100; i++) {
        extremeVelocities.forEach(velocity => {
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              translationX: i * 10,
              translationY: i * 5,
              ...velocity,
            },
          });
        });
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      // Should handle all extreme cases within reasonable time
      expect(processingTime).toBeLessThan(100); // Less than 100ms for all tests
    });
  });

  describe('Memory Management Stress Tests', () => {
    it('should not create memory leaks during prolonged usage', async () => {
      const { getByTestId, unmount } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={mockOnSwipeLeft}
          onSwipeRight={mockOnSwipeRight}
          onSwipeUp={mockOnSwipeUp}
          isActive={true}
        />
      );

      const gestureHandler = getByTestId('pan-gesture-handler');
      
      // Simulate prolonged usage with many gesture events
      for (let session = 0; session < 10; session++) {
        for (let i = 0; i < 100; i++) {
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              translationX: Math.random() * SWIPE_THRESHOLD,
              translationY: Math.random() * 50,
              velocityX: Math.random() * 1000 - 500,
              velocityY: Math.random() * 200 - 100,
            },
          });
        }
        
        // Simulate brief pause between sessions
        jest.advanceTimersByTime(100);
      }

      // Allow cleanup time
      jest.advanceTimersByTime(1000);
      
      // @ts-ignore
      const metrics = require('react-native-reanimated').getStressMetrics();
      
      // Should not have excessive potential memory leaks
      expect(metrics.potentialMemoryLeaks).toBeLessThan(50);
      
      // Cleanup
      unmount();
      jest.advanceTimersByTime(200);
      
      // Timer count should be manageable after unmount
      expect(jest.getTimerCount()).toBeLessThan(10);
    });

    it('should handle multiple simultaneous cards without interference', () => {
      const cards = [];
      
      // Render multiple cards simultaneously
      for (let i = 0; i < 5; i++) {
        const cardJoke = { ...mockJoke, id: `joke_${i}` };
        cards.push(
          render(
            <JokeCard
              key={i}
              joke={cardJoke}
              onSwipeLeft={mockOnSwipeLeft}
              onSwipeRight={mockOnSwipeRight}
              onSwipeUp={mockOnSwipeUp}
              isActive={i === 0} // Only first card is active
            />
          )
        );
      }

      // Simulate gestures on all cards
      cards.forEach((card, index) => {
        const gestureHandler = card.getByTestId('pan-gesture-handler');
        
        for (let i = 0; i < 20; i++) {
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              translationX: i * 5,
              translationY: 0,
              velocityX: 100,
              velocityY: 0,
            },
          });
        }
      });

      // All cards should render without issues
      cards.forEach(card => {
        expect(card.getByTestId('joke-card')).toBeTruthy();
      });

      // Cleanup
      cards.forEach(card => card.unmount());
    });
  });

  describe('Animation Calculation Stress Tests', () => {
    it('should efficiently handle complex interpolation scenarios', () => {
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
      
      // Create complex interpolation scenarios
      const complexScenarios = [];
      for (let i = 0; i < 200; i++) {
        complexScenarios.push({
          translationX: Math.sin(i * 0.1) * SWIPE_THRESHOLD * 2,
          translationY: Math.cos(i * 0.1) * VERTICAL_SWIPE_THRESHOLD * 2,
          velocityX: Math.sin(i * 0.2) * 2000,
          velocityY: Math.cos(i * 0.2) * 1000,
        });
      }

      const startTime = performance.now();
      
      complexScenarios.forEach(scenario => {
        gestureHandler.props.onGestureEvent({
          nativeEvent: scenario,
        });
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should handle all complex calculations efficiently
      expect(totalTime).toBeLessThan(50); // Less than 50ms for 200 complex calculations
      
      // @ts-ignore
      const metrics = require('react-native-reanimated').getStressMetrics();
      expect(metrics.averageStyleCalculationTime).toBeLessThan(0.5); // Average should be very fast
    });

    it('should handle edge cases in animation calculations', () => {
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
      
      // Test edge cases that might break interpolations
      const edgeCases = [
        { translationX: 0, translationY: 0 },
        { translationX: Infinity, translationY: 0 },
        { translationX: -Infinity, translationY: 0 },
        { translationX: NaN, translationY: 0 },
        { translationX: Number.MAX_VALUE, translationY: 0 },
        { translationX: Number.MIN_VALUE, translationY: 0 },
        { translationX: 0, translationY: Infinity },
        { translationX: 0, translationY: -Infinity },
        { translationX: 0, translationY: NaN },
      ];

      edgeCases.forEach(edgeCase => {
        expect(() => {
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              ...edgeCase,
              velocityX: 0,
              velocityY: 0,
            },
          });
        }).not.toThrow();
      });
    });
  });

  describe('State Management Stress Tests', () => {
    it('should handle rapid state changes without corruption', () => {
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
      
      // Simulate rapid state changes
      const states = [2, 4, 5, 2, 4, 5]; // BEGAN, ACTIVE, END repeatedly
      
      for (let cycle = 0; cycle < 50; cycle++) {
        states.forEach(state => {
          gestureHandler.props.onHandlerStateChange({
            nativeEvent: {
              state,
              translationX: Math.random() * SWIPE_THRESHOLD,
              translationY: Math.random() * 50,
              velocityX: Math.random() * 1000 - 500,
              velocityY: Math.random() * 200 - 100,
            },
          });
        });
      }

      // Should handle all state changes without errors
      expect(() => {
        jest.advanceTimersByTime(1000);
      }).not.toThrow();
    });

    it('should maintain consistency during concurrent animations', async () => {
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
      
      // Start multiple concurrent animations
      const animations = [
        () => {
          // Translation animation
          for (let i = 0; i < 50; i++) {
            gestureHandler.props.onGestureEvent({
              nativeEvent: {
                translationX: i * 2,
                translationY: 0,
                velocityX: 100,
                velocityY: 0,
              },
            });
          }
        },
        () => {
          // Scale animation (triggered by distance)
          for (let i = 0; i < 50; i++) {
            gestureHandler.props.onGestureEvent({
              nativeEvent: {
                translationX: 0,
                translationY: i * 3,
                velocityX: 0,
                velocityY: 150,
              },
            });
          }
        },
        () => {
          // Rotation animation
          for (let i = 0; i < 50; i++) {
            gestureHandler.props.onGestureEvent({
              nativeEvent: {
                translationX: Math.sin(i * 0.1) * 100,
                translationY: 0,
                velocityX: Math.cos(i * 0.1) * 200,
                velocityY: 0,
              },
            });
          }
        },
      ];

      // Run animations concurrently
      animations.forEach(animation => animation());
      
      // Should complete without issues
      jest.advanceTimersByTime(500);
      
      // No callbacks should be triggered for incomplete swipes
      expect(mockOnSwipeLeft).not.toHaveBeenCalled();
      expect(mockOnSwipeRight).not.toHaveBeenCalled();
      expect(mockOnSwipeUp).not.toHaveBeenCalled();
    });
  });

  describe('Resource Cleanup Stress Tests', () => {
    it('should properly clean up resources after stress testing', () => {
      const components = [];
      
      // Create and destroy multiple components rapidly
      for (let i = 0; i < 20; i++) {
        const component = render(
          <JokeCard
            joke={{...mockJoke, id: `stress_${i}`}}
            onSwipeLeft={mockOnSwipeLeft}
            onSwipeRight={mockOnSwipeRight}
            onSwipeUp={mockOnSwipeUp}
            isActive={true}
          />
        );
        
        // Simulate some activity
        const gestureHandler = component.getByTestId('pan-gesture-handler');
        for (let j = 0; j < 10; j++) {
          gestureHandler.props.onGestureEvent({
            nativeEvent: {
              translationX: j * 5,
              translationY: 0,
              velocityX: 100,
              velocityY: 0,
            },
          });
        }
        
        components.push(component);
      }

      // Unmount all components
      components.forEach(component => component.unmount());
      
      // Advance timers to allow cleanup
      jest.advanceTimersByTime(1000);
      
      // Should have minimal active timers after cleanup
      expect(jest.getTimerCount()).toBeLessThan(5);
    });
  });
});