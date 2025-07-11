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
} from 'react-native-reanimated';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.25;
const SWIPE_OUT_DURATION = 250;
const SWIPE_VELOCITY_THRESHOLD = 800;
const VERTICAL_SWIPE_THRESHOLD = screenHeight * 0.2;

const AnimatedView = ReAnimated.createAnimatedComponent(View);

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
        translateY.value = withTiming(-screenHeight, { duration: SWIPE_OUT_DURATION }, () => {
          handleSwipeUp();
          translateX.value = 0;
          translateY.value = 0;
        });
        return;
      }

      // Check for right swipe (like)
      if (
        translationX > SWIPE_THRESHOLD ||
        (translationX > screenWidth * 0.1 && velocityX > SWIPE_VELOCITY_THRESHOLD)
      ) {
        translateX.value = withTiming(screenWidth + 100, { duration: SWIPE_OUT_DURATION }, () => {
          handleSwipeRight();
          translateX.value = 0;
          translateY.value = 0;
        });
        return;
      }

      // Check for left swipe (dislike)
      if (
        translationX < -SWIPE_THRESHOLD ||
        (translationX < -screenWidth * 0.1 && velocityX < -SWIPE_VELOCITY_THRESHOLD)
      ) {
        translateX.value = withTiming(-screenWidth - 100, { duration: SWIPE_OUT_DURATION }, () => {
          handleSwipeLeft();
          translateX.value = 0;
          translateY.value = 0;
        });
        return;
      }

      // Spring back to center
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-screenWidth / 2, 0, screenWidth / 2],
      [-10, 0, 10],
      Extrapolate.CLAMP
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const likeOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [-screenWidth / 4, 0, screenWidth / 4],
        [0, 0, 1],
        Extrapolate.CLAMP
      ),
    };
  });

  const nopeOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateX.value,
        [-screenWidth / 4, 0, screenWidth / 4],
        [1, 0, 0],
        Extrapolate.CLAMP
      ),
    };
  });

  const neutralOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        translateY.value,
        [-screenHeight / 4, 0, screenHeight / 4],
        [1, 0, 0],
        Extrapolate.CLAMP
      ),
    };
  });

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
    <PanGestureHandler onGestureEvent={gestureHandler} enabled={isActive}>
      <AnimatedView
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

          <AnimatedView
            style={[styles.likeContainer, likeOpacityStyle]}
          >
            <Text style={styles.likeText}>LIKE</Text>
          </AnimatedView>

          <AnimatedView
            style={[styles.nopeContainer, nopeOpacityStyle]}
          >
            <Text style={styles.nopeText}>NOPE</Text>
          </AnimatedView>

          <AnimatedView
            style={[styles.neutralContainer, neutralOpacityStyle]}
          >
            <Text style={styles.neutralText}>NEUTRAL</Text>
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
  likeContainer: {
    position: 'absolute',
    top: 50,
    left: 40,
    padding: 10,
    borderWidth: 4,
    borderColor: '#4CAF50',
    borderRadius: 10,
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
    padding: 10,
    borderWidth: 4,
    borderColor: '#F44336',
    borderRadius: 10,
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
    padding: 10,
    borderWidth: 4,
    borderColor: '#FFC107',
    borderRadius: 10,
  },
  neutralText: {
    fontSize: 32,
    color: '#FFC107',
    fontWeight: 'bold',
  },
  inactiveCard: {
    transform: [{ scale: 0.8 }],
  },
});

export default JokeCard;