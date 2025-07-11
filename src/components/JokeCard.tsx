import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  PanGestureHandler,
  State,
  PanGestureHandlerStateChangeEvent,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedGestureHandler,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  interpolateColor,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.25;
const SWIPE_OUT_DURATION = 250;
const SWIPE_VELOCITY_THRESHOLD = 800;
const VERTICAL_SWIPE_THRESHOLD = screenHeight * 0.2;
const ROTATION_MULTIPLIER = 0.03;
const HAPTIC_THRESHOLD = screenWidth * 0.1;

const AnimatedView = ReAnimated.default?.createAnimatedComponent ? 
  ReAnimated.default.createAnimatedComponent(View) : 
  ReAnimated.createAnimatedComponent ? ReAnimated.createAnimatedComponent(View) : View;

interface JokeCardProps {
  joke: {
    id: string;
    text: string;
    category?: string;
  };
  onSwipeLeft: (id: string) => void;
  onSwipeRight: (id: string) => void;
  onSwipeUp?: (id: string) => void;
  isActive: boolean;
  isLoading?: boolean;
  error?: string | null;
}

// Error boundary component for card-level error handling
export class JokeCardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Something went wrong with this joke!</Text>
          <Text style={styles.errorSubtext}>
            {this.state.error?.message || 'Please try again'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const JokeCard: React.FC<JokeCardProps> = ({
  joke,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  isActive,
  isLoading = false,
  error = null,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const hasTriggeredHaptic = useSharedValue(false);

  const triggerHaptic = (intensity: 'Light' | 'Medium' | 'Heavy' = 'Light') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle[intensity]);
  };

  const handleSwipeLeft = () => {
    'worklet';
    runOnJS(onSwipeLeft)(joke.id);
  };

  const handleSwipeRight = () => {
    'worklet';
    runOnJS(onSwipeRight)(joke.id);
  };

  const handleSwipeUp = () => {
    'worklet';
    if (onSwipeUp) {
      runOnJS(onSwipeUp)(joke.id);
    }
  };

  const gestureHandler = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    { startX: number; startY: number }
  >({
    onStart: (_, ctx) => {
      ctx.startX = translateX.value;
      ctx.startY = translateY.value;
    },
    onActive: (event, ctx) => {
      if (!isActive) return;
      translateX.value = ctx.startX + event.translationX;
      translateY.value = ctx.startY + event.translationY;
      
      // Trigger haptic feedback when crossing threshold
      const absX = Math.abs(translateX.value);
      const absY = Math.abs(translateY.value);
      
      if (!hasTriggeredHaptic.value && 
          (absX > HAPTIC_THRESHOLD || (absY > HAPTIC_THRESHOLD && translateY.value < 0))) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)('Light');
      }
      
      // Scale animation based on distance
      const distance = Math.sqrt(translateX.value ** 2 + translateY.value ** 2);
      scale.value = interpolate(
        distance,
        [0, screenWidth / 2],
        [1, 0.9],
        Extrapolate.CLAMP
      );
    },
    onEnd: (event) => {
      if (!isActive) return;

      const velocityX = event.velocityX;
      const velocityY = event.velocityY;
      const translationX = event.translationX;
      const translationY = event.translationY;

      // Check for upward swipe (neutral)
      if (
        Math.abs(translationY) > Math.abs(translationX) &&
        translationY < -VERTICAL_SWIPE_THRESHOLD &&
        velocityY < -SWIPE_VELOCITY_THRESHOLD
      ) {
        runOnJS(triggerHaptic)('Medium');
        translateY.value = withTiming(-screenHeight, { duration: SWIPE_OUT_DURATION }, () => {
          handleSwipeUp();
          translateX.value = 0;
          translateY.value = 0;
          hasTriggeredHaptic.value = false;
        });
        return;
      }

      // Check for right swipe (like)
      if (
        translationX > SWIPE_THRESHOLD ||
        (translationX > screenWidth * 0.1 && velocityX > SWIPE_VELOCITY_THRESHOLD)
      ) {
        runOnJS(triggerHaptic)('Medium');
        translateX.value = withTiming(screenWidth + 100, { duration: SWIPE_OUT_DURATION }, () => {
          handleSwipeRight();
          translateX.value = 0;
          translateY.value = 0;
          hasTriggeredHaptic.value = false;
        });
        return;
      }

      // Check for left swipe (dislike)
      if (
        translationX < -SWIPE_THRESHOLD ||
        (translationX < -screenWidth * 0.1 && velocityX < -SWIPE_VELOCITY_THRESHOLD)
      ) {
        runOnJS(triggerHaptic)('Medium');
        translateX.value = withTiming(-screenWidth - 100, { duration: SWIPE_OUT_DURATION }, () => {
          handleSwipeLeft();
          translateX.value = 0;
          translateY.value = 0;
          hasTriggeredHaptic.value = false;
        });
        return;
      }

      // Spring back to center with haptic feedback
      translateX.value = withSpring(0, {
        damping: 15,
        stiffness: 100,
        mass: 1,
      });
      translateY.value = withSpring(0, {
        damping: 15,
        stiffness: 100,
        mass: 1,
      });
      scale.value = withSpring(1);
      hasTriggeredHaptic.value = false;
      runOnJS(triggerHaptic)('Light');
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    'worklet';
    const rotate = translateX.value * ROTATION_MULTIPLIER;

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
        { scale: scale.value },
      ],
    };
  }, []);

  // Animated overlay style with color transitions
  const overlayStyle = useAnimatedStyle(() => {
    'worklet';
    const likeProgress = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolate.CLAMP
    );
    
    const dislikeProgress = interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolate.CLAMP
    );
    
    const neutralProgress = interpolate(
      translateY.value,
      [-VERTICAL_SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolate.CLAMP
    );

    let backgroundColor = 'transparent';
    let opacity = 0;

    if (likeProgress > 0) {
      backgroundColor = interpolateColor(
        likeProgress,
        [0, 1],
        ['transparent', 'rgba(76, 175, 80, 0.3)']
      );
      opacity = likeProgress * 0.5;
    } else if (dislikeProgress > 0) {
      backgroundColor = interpolateColor(
        dislikeProgress,
        [0, 1],
        ['transparent', 'rgba(244, 67, 54, 0.3)']
      );
      opacity = dislikeProgress * 0.5;
    } else if (neutralProgress > 0 && translateY.value < 0) {
      backgroundColor = interpolateColor(
        neutralProgress,
        [0, 1],
        ['transparent', 'rgba(158, 158, 158, 0.3)']
      );
      opacity = neutralProgress * 0.5;
    }

    return {
      backgroundColor,
      opacity,
    };
  }, []);

  const likeOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: interpolate(
        translateX.value,
        [-screenWidth / 4, 0, screenWidth / 4],
        [0, 0, 1],
        Extrapolate.CLAMP
      ),
    };
  }, []);

  const nopeOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: interpolate(
        translateX.value,
        [-screenWidth / 4, 0, screenWidth / 4],
        [1, 0, 0],
        Extrapolate.CLAMP
      ),
    };
  }, []);

  const neutralOpacityStyle = useAnimatedStyle(() => {
    'worklet';
    return {
      opacity: interpolate(
        translateY.value,
        [-screenHeight / 4, 0, screenHeight / 4],
        [1, 0, 0],
        Extrapolate.CLAMP
      ),
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading joke...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.card, styles.errorCard]}>
        <Text style={styles.errorIcon}>😕</Text>
        <Text style={styles.errorText}>Oops! Something went wrong</Text>
        <Text style={styles.errorSubtext}>{error}</Text>
      </View>
    );
  }

  return (
    <PanGestureHandler onGestureEvent={gestureHandler} enabled={isActive} testID="pan-gesture-handler">
      <AnimatedView
        testID="joke-card"
        style={[
          styles.card,
          cardStyle,
          !isActive && styles.inactiveCard,
        ]}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.gradient}
        >
          {joke.category && (
            <Text style={styles.category}>{joke.category.toUpperCase()}</Text>
          )}
          <Text
            style={styles.jokeText}
            adjustsFontSizeToFit
            numberOfLines={8}
          >
            {joke.text}
          </Text>

          {/* Animated color overlay */}
          <AnimatedView style={[styles.overlay, overlayStyle]} pointerEvents="none" />
          
          <AnimatedView
            style={[styles.likeContainer, likeOpacityStyle]}
            pointerEvents="none"
          >
            <View style={styles.labelWrapper}>
              <Text style={styles.likeText}>LIKE</Text>
            </View>
          </AnimatedView>

          <AnimatedView
            style={[styles.nopeContainer, nopeOpacityStyle]}
            pointerEvents="none"
          >
            <View style={styles.labelWrapper}>
              <Text style={styles.nopeText}>NOPE</Text>
            </View>
          </AnimatedView>

          <AnimatedView
            style={[styles.neutralContainer, neutralOpacityStyle]}
            pointerEvents="none"
          >
            <View style={styles.labelWrapper}>
              <Text style={styles.neutralText}>NEUTRAL</Text>
            </View>
          </AnimatedView>
        </LinearGradient>
      </AnimatedView>
    </PanGestureHandler>
  );
};

const styles = StyleSheet.create({
  loadingCard: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#667eea',
    fontWeight: '500',
  },
  errorCard: {
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  card: {
    position: 'absolute',
    width: screenWidth * 0.9,
    height: screenHeight * 0.7,
    alignSelf: 'center',
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  gradient: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  category: {
    position: 'absolute',
    top: 20,
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.7)',
    letterSpacing: 2,
  },
  jokeText: {
    fontSize: 24,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 36,
    paddingHorizontal: 20,
    maxHeight: screenHeight * 0.5,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  labelWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  likeContainer: {
    position: 'absolute',
    top: 50,
    left: 40,
    transform: [{ rotate: '-30deg' }],
  },
  likeText: {
    fontSize: 32,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  nopeContainer: {
    position: 'absolute',
    top: 50,
    right: 40,
    transform: [{ rotate: '30deg' }],
  },
  nopeText: {
    fontSize: 32,
    color: '#F44336',
    fontWeight: 'bold',
  },
  neutralContainer: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
  },
  neutralText: {
    fontSize: 32,
    color: '#9E9E9E',
    fontWeight: 'bold',
  },
  inactiveCard: {
    transform: [{ scale: 0.8 }],
  },
});

export default JokeCard;