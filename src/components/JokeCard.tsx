import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.25;
const SWIPE_OUT_DURATION = 250;

interface JokeCardProps {
  joke: {
    id: string;
    text: string;
    category?: string;
  };
  onSwipeLeft: (id: string) => void;
  onSwipeRight: (id: string) => void;
  isActive: boolean;
}

const JokeCard: React.FC<JokeCardProps> = ({
  joke,
  onSwipeLeft,
  onSwipeRight,
  isActive,
}) => {
  const position = useRef(new Animated.ValueXY()).current;
  const rotateValue = useRef(new Animated.Value(0)).current;

  const rotation = rotateValue.interpolate({
    inputRange: [-screenWidth / 2, 0, screenWidth / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [-screenWidth / 4, 0, screenWidth / 4],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  const nopeOpacity = position.x.interpolate({
    inputRange: [-screenWidth / 4, 0, screenWidth / 4],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  const nextCardOpacity = position.x.interpolate({
    inputRange: [-screenWidth / 4, 0, screenWidth / 4],
    outputRange: [1, 1, 1],
    extrapolate: 'clamp',
  });

  const nextCardScale = position.x.interpolate({
    inputRange: [-screenWidth / 4, 0, screenWidth / 4],
    outputRange: [1, 0.8, 1],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => isActive,
      onMoveShouldSetPanResponder: () => isActive,
      onPanResponderGrant: () => {
        position.setOffset({
          x: (position.x as any)._value,
          y: (position.y as any)._value,
        });
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, gestureState) => {
        position.setValue({ x: gestureState.dx, y: gestureState.dy });
        rotateValue.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        position.flattenOffset();

        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe right - Like
          Animated.timing(position, {
            toValue: { x: screenWidth + 100, y: gestureState.dy },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: false,
          }).start(() => {
            onSwipeRight(joke.id);
            position.setValue({ x: 0, y: 0 });
            rotateValue.setValue(0);
          });
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe left - Nope
          Animated.timing(position, {
            toValue: { x: -screenWidth - 100, y: gestureState.dy },
            duration: SWIPE_OUT_DURATION,
            useNativeDriver: false,
          }).start(() => {
            onSwipeLeft(joke.id);
            position.setValue({ x: 0, y: 0 });
            rotateValue.setValue(0);
          });
        } else {
          // Spring back to center
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 4,
            useNativeDriver: false,
          }).start();
          Animated.spring(rotateValue, {
            toValue: 0,
            friction: 4,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const animatedCardStyle = {
    transform: [...position.getTranslateTransform(), { rotate: rotation }],
    opacity: nextCardOpacity,
  };

  return (
    <Animated.View
      style={[
        styles.card,
        animatedCardStyle,
        !isActive && {
          transform: [{ scale: nextCardScale }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.gradient}
      >
        {joke.category && (
          <Text style={styles.category}>{joke.category.toUpperCase()}</Text>
        )}
        <Text style={styles.jokeText}>{joke.text}</Text>

        <Animated.View
          style={[styles.likeContainer, { opacity: likeOpacity }]}
        >
          <Text style={styles.likeText}>LIKE</Text>
        </Animated.View>

        <Animated.View
          style={[styles.nopeContainer, { opacity: nopeOpacity }]}
        >
          <Text style={styles.nopeText}>NOPE</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
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
});

export default JokeCard;