import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  AccessibilityInfo,
  findNodeHandle,
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
const PULL_TO_REFRESH_THRESHOLD = screenHeight * 0.15;
const PULL_TO_REFRESH_VELOCITY_THRESHOLD = 600;

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
  onPullToRefresh?: () => void;
  isActive: boolean;
  isLoading?: boolean;
  error?: string | null;
  showHints?: boolean;
  reducedMotion?: boolean;
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
  onPullToRefresh,
  isActive,
  isLoading = false,
  error = null,
  showHints = false,
  reducedMotion = false,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const hasTriggeredHaptic = useSharedValue(false);
  const pullToRefreshProgress = useSharedValue(0);
  const cardRef = useRef<View>(null);
  const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);
  
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setIsScreenReaderEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setIsScreenReaderEnabled
    );
    return () => subscription?.remove();
  }, []);

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

  const handlePullToRefresh = () => {
    'worklet';
    if (onPullToRefresh) {
      runOnJS(onPullToRefresh)();
    }
  };

  const announceAction = (action: string) => {
    if (isScreenReaderEnabled) {
      AccessibilityInfo.announceForAccessibility(`${action} joke: ${joke.text.substring(0, 50)}...`);
    }
  };

  const handleAccessibilityAction = (actionName: string) => {
    switch (actionName) {
      case 'like':
        announceAction('Liked');
        onSwipeRight(joke.id);
        break;
      case 'dislike':
        announceAction('Disliked');
        onSwipeLeft(joke.id);
        break;
      case 'neutral':
        if (onSwipeUp) {
          announceAction('Marked as neutral');
          onSwipeUp(joke.id);
        }
        break;
      case 'refresh':
        if (onPullToRefresh) {
          announceAction('Refreshing');
          onPullToRefresh();
        }
        break;
    }
  };

  const focusCard = () => {
    if (cardRef.current && isScreenReaderEnabled) {
      const reactTag = findNodeHandle(cardRef.current);
      if (reactTag) {
        AccessibilityInfo.setAccessibilityFocus(reactTag);
      }
    }
  };

  useEffect(() => {
    if (isActive && isScreenReaderEnabled) {
      // Small delay to ensure the card is rendered
      const timer = setTimeout(focusCard, 100);
      return () => clearTimeout(timer);
    }
  }, [isActive, isScreenReaderEnabled]);

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
      
      // Update pull-to-refresh progress for downward swipes
      if (translateY.value > 0) {
        pullToRefreshProgress.value = interpolate(
          translateY.value,
          [0, PULL_TO_REFRESH_THRESHOLD],
          [0, 1],
          Extrapolate.CLAMP
        );
      } else {
        pullToRefreshProgress.value = 0;
      }
      
      // Trigger haptic feedback when crossing threshold
      const absX = Math.abs(translateX.value);
      const absY = Math.abs(translateY.value);
      
      if (!hasTriggeredHaptic.value && 
          (absX > HAPTIC_THRESHOLD || 
           (absY > HAPTIC_THRESHOLD && translateY.value < 0) ||
           (translateY.value > HAPTIC_THRESHOLD && onPullToRefresh))) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)('Light');
      }
      
      // Scale animation based on distance (respect reduced motion)
      if (!reducedMotion) {
        const distance = Math.sqrt(translateX.value ** 2 + translateY.value ** 2);
        scale.value = interpolate(
          distance,
          [0, screenWidth / 2],
          [1, 0.9],
          Extrapolate.CLAMP
        );
      }
    },
    onEnd: (event) => {
      if (!isActive) return;

      const velocityX = event.velocityX;
      const velocityY = event.velocityY;
      const translationX = event.translationX;
      const translationY = event.translationY;

      // Check for pull-to-refresh (downward swipe)
      if (
        onPullToRefresh &&
        Math.abs(translationY) > Math.abs(translationX) &&
        translationY > PULL_TO_REFRESH_THRESHOLD &&
        velocityY > PULL_TO_REFRESH_VELOCITY_THRESHOLD
      ) {
        runOnJS(triggerHaptic)('Medium');
        handlePullToRefresh();
        // Spring back animation
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        pullToRefreshProgress.value = withTiming(0);
        hasTriggeredHaptic.value = false;
        return;
      }

      // Check for upward swipe (neutral)
      if (
        Math.abs(translationY) > Math.abs(translationX) &&
        translationY < -VERTICAL_SWIPE_THRESHOLD &&
        velocityY < -SWIPE_VELOCITY_THRESHOLD
      ) {
        runOnJS(triggerHaptic)('Medium');
        const duration = reducedMotion ? 100 : SWIPE_OUT_DURATION;
        translateY.value = withTiming(-screenHeight, { duration }, () => {
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
        const duration = reducedMotion ? 100 : SWIPE_OUT_DURATION;
        translateX.value = withTiming(screenWidth + 100, { duration }, () => {
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
        const duration = reducedMotion ? 100 : SWIPE_OUT_DURATION;
        translateX.value = withTiming(-screenWidth - 100, { duration }, () => {
          handleSwipeLeft();
          translateX.value = 0;
          translateY.value = 0;
          hasTriggeredHaptic.value = false;
        });
        return;
      }

      // Spring back to center with haptic feedback
      const springConfig = reducedMotion ? 
        { damping: 25, stiffness: 200, mass: 1 } : 
        { damping: 15, stiffness: 100, mass: 1 };
        
      translateX.value = withSpring(0, springConfig);
      translateY.value = withSpring(0, springConfig);
      scale.value = withSpring(1, springConfig);
      pullToRefreshProgress.value = withTiming(0);
      hasTriggeredHaptic.value = false;
      runOnJS(triggerHaptic)('Light');
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    'worklet';
    const rotate = reducedMotion ? 0 : translateX.value * ROTATION_MULTIPLIER;

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
        { scale: scale.value },
      ],
    };
  }, [reducedMotion]);

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

  // Pull-to-refresh indicator style
  const pullToRefreshStyle = useAnimatedStyle(() => {
    'worklet';
    const opacity = interpolate(
      pullToRefreshProgress.value,
      [0, 0.5, 1],
      [0, 0.5, 1],
      Extrapolate.CLAMP
    );
    
    const scale = interpolate(
      pullToRefreshProgress.value,
      [0, 1],
      [0.8, 1.2],
      Extrapolate.CLAMP
    );

    return {
      opacity,
      transform: [{ scale: reducedMotion ? 1 : scale }],
    };
  }, [reducedMotion]);

  // Loading state
  if (isLoading) {
    return (
      <View 
        style={[styles.card, styles.loadingCard]}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel="Loading a new joke, please wait"
        accessibilityState={{ busy: true }}
      >
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading joke...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View 
        style={[styles.card, styles.errorCard]}
        accessible={true}
        accessibilityRole="alert"
        accessibilityLabel={`Error occurred: ${error}. Please try again.`}
      >
        <Text style={styles.errorIcon} accessible={false}>😕</Text>
        <Text style={styles.errorText}>Oops! Something went wrong</Text>
        <Text style={styles.errorSubtext}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PanGestureHandler onGestureEvent={gestureHandler} enabled={isActive && !isScreenReaderEnabled} testID="pan-gesture-handler">
        <AnimatedView
          ref={cardRef}
          testID="joke-card"
          style={[
            styles.card,
            cardStyle,
            !isActive && styles.inactiveCard,
          ]}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Joke: ${joke.text}${joke.category ? `. Category: ${joke.category}` : ''}. ${isActive ? 'Swipe right to like, left to dislike, up for neutral' : 'Inactive joke card'}`}
          accessibilityHint={isActive ? "Double tap to hear options, or use swipe gestures" : undefined}
          accessibilityActions={isActive ? [
            { name: 'like', label: 'Like this joke' },
            { name: 'dislike', label: 'Dislike this joke' },
            ...(onSwipeUp ? [{ name: 'neutral', label: 'Mark as neutral' }] : []),
            ...(onPullToRefresh ? [{ name: 'refresh', label: 'Get new joke' }] : []),
          ] : []}
          onAccessibilityAction={(event: any) => {
            handleAccessibilityAction(event.nativeEvent.actionName);
          }}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.gradient}
          >
            {joke.category && (
              <Text 
                style={styles.category}
                accessible={false}
              >
                {joke.category.toUpperCase()}
              </Text>
            )}
            <Text
              style={styles.jokeText}
              adjustsFontSizeToFit
              numberOfLines={8}
              accessible={false}
            >
              {joke.text}
            </Text>

            {/* Animated color overlay */}
            <AnimatedView style={[styles.overlay, overlayStyle]} pointerEvents="none" accessible={false} />
            
            <AnimatedView
              style={[styles.likeContainer, likeOpacityStyle]}
              pointerEvents="none"
              accessible={false}
            >
              <View style={styles.labelWrapper}>
                <Text style={styles.likeText}>LIKE</Text>
              </View>
            </AnimatedView>

            <AnimatedView
              style={[styles.nopeContainer, nopeOpacityStyle]}
              pointerEvents="none"
              accessible={false}
            >
              <View style={styles.labelWrapper}>
                <Text style={styles.nopeText}>NOPE</Text>
              </View>
            </AnimatedView>

            <AnimatedView
              style={[styles.neutralContainer, neutralOpacityStyle]}
              pointerEvents="none"
              accessible={false}
            >
              <View style={styles.labelWrapper}>
                <Text style={styles.neutralText}>NEUTRAL</Text>
              </View>
            </AnimatedView>

            {/* Pull-to-refresh indicator */}
            {onPullToRefresh && (
              <AnimatedView
                style={[styles.pullToRefreshContainer, pullToRefreshStyle]}
                pointerEvents="none"
                accessible={false}
              >
                <Text style={styles.pullToRefreshText}>↓ Pull for new joke</Text>
              </AnimatedView>
            )}

            {/* Gesture hints for first-time users */}
            {showHints && (
              <View style={styles.hintsContainer} accessible={false}>
                <Text style={styles.hintText}>← Dislike</Text>
                <Text style={styles.hintText}>Like →</Text>
                <Text style={styles.hintText}>↑ Neutral</Text>
                {onPullToRefresh && <Text style={styles.hintText}>↓ New joke</Text>}
              </View>
            )}
          </LinearGradient>
        </AnimatedView>
      </PanGestureHandler>

      {/* Accessibility action buttons */}
      {(isActive && isScreenReaderEnabled) && (
        <View style={styles.accessibilityButtonsContainer}>
          <TouchableOpacity
            style={[styles.accessibilityButton, styles.dislikeButton]}
            onPress={() => handleAccessibilityAction('dislike')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Dislike this joke"
            accessibilityHint="Marks this joke as disliked and shows the next one"
          >
            <Text style={styles.accessibilityButtonText}>👎 Dislike</Text>
          </TouchableOpacity>
          
          {onSwipeUp && (
            <TouchableOpacity
              style={[styles.accessibilityButton, styles.neutralButton]}
              onPress={() => handleAccessibilityAction('neutral')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Mark joke as neutral"
              accessibilityHint="Marks this joke as neutral and shows the next one"
            >
              <Text style={styles.accessibilityButtonText}>➖ Neutral</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.accessibilityButton, styles.likeButton]}
            onPress={() => handleAccessibilityAction('like')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Like this joke"
            accessibilityHint="Marks this joke as liked and shows the next one"
          >
            <Text style={styles.accessibilityButtonText}>👍 Like</Text>
          </TouchableOpacity>
          
          {onPullToRefresh && (
            <TouchableOpacity
              style={[styles.accessibilityButton, styles.refreshButton]}
              onPress={() => handleAccessibilityAction('refresh')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Get a new joke"
              accessibilityHint="Loads a completely new joke"
            >
              <Text style={styles.accessibilityButtonText}>🔄 New Joke</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
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
  pullToRefreshContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
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
  pullToRefreshText: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '600',
  },
  hintsContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    textAlign: 'center',
  },
  accessibilityButtonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  accessibilityButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  dislikeButton: {
    backgroundColor: '#F44336',
  },
  neutralButton: {
    backgroundColor: '#9E9E9E',
  },
  likeButton: {
    backgroundColor: '#4CAF50',
  },
  refreshButton: {
    backgroundColor: '#2196F3',
  },
  accessibilityButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default JokeCard;

// Helper component for gesture hints
export const GestureHints: React.FC<{ visible: boolean; onPullToRefresh?: boolean }> = ({ visible, onPullToRefresh }) => {
  if (!visible) return null;
  
  return (
    <View style={hintsOverlayStyles.container} pointerEvents="none">
      <Text style={hintsOverlayStyles.hint}>← Swipe left to dislike</Text>
      <Text style={hintsOverlayStyles.hint}>Swipe right to like →</Text>
      <Text style={hintsOverlayStyles.hint}>↑ Swipe up for neutral</Text>
      {onPullToRefresh && (
        <Text style={hintsOverlayStyles.hint}>↓ Pull down for new joke</Text>
      )}
    </View>
  );
};

const hintsOverlayStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1000,
  },
  hint: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 8,
    paddingHorizontal: 20,
  },
});