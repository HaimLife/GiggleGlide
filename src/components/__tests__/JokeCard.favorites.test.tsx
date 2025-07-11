import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import JokeCard from '../JokeCard';
import { SharingService } from '../../services/SharingService';

// Mock SharingService
jest.mock('../../services/SharingService');

// Mock react-native modules
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  return {
    ...Reanimated,
    useSharedValue: jest.fn(() => ({ value: 0 })),
    useAnimatedStyle: jest.fn(() => ({})),
    useAnimatedGestureHandler: jest.fn(() => jest.fn()),
    withSpring: jest.fn((value) => value),
    withTiming: jest.fn((value) => value),
    runOnJS: jest.fn((fn) => fn),
    interpolate: jest.fn(() => 0),
    interpolateColor: jest.fn(() => 'transparent'),
    createAnimatedComponent: jest.fn((component) => component),
  };
});

jest.mock('react-native-gesture-handler', () => ({
  PanGestureHandler: 'PanGestureHandler',
  State: {},
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    announceForAccessibility: jest.fn(),
    setAccessibilityFocus: jest.fn(),
  },
  findNodeHandle: jest.fn(() => 1),
}));

const mockJoke = {
  id: '1',
  txt: 'Why don\'t scientists trust atoms? Because they make up everything!',
  lang: 'en',
  style: 'pun' as const,
  topic: 'science' as const,
  tone: 'light' as const,
  format: 'qa' as const,
};

describe('JokeCard - Favorites and Sharing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Favorite functionality', () => {
    it('shows unfavorite star when not favorited', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
        />
      );

      const favoriteButton = getByTestId('favorite-button');
      expect(favoriteButton).toBeTruthy();
      expect(favoriteButton.children[0]).toHaveTextContent('☆');
    });

    it('shows favorite star when favorited', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={true}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
        />
      );

      const favoriteButton = getByTestId('favorite-button');
      expect(favoriteButton).toBeTruthy();
      expect(favoriteButton.children[0]).toHaveTextContent('★');
    });

    it('calls onFavoriteToggle when favorite button is pressed', () => {
      const onFavoriteToggle = jest.fn();
      
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={onFavoriteToggle}
          showFavoriteButton={true}
        />
      );

      const favoriteButton = getByTestId('favorite-button');
      fireEvent.press(favoriteButton);

      expect(onFavoriteToggle).toHaveBeenCalledWith('1', true);
    });

    it('calls onFavoriteToggle with correct state when unfavoriting', () => {
      const onFavoriteToggle = jest.fn();
      
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={true}
          onFavoriteToggle={onFavoriteToggle}
          showFavoriteButton={true}
        />
      );

      const favoriteButton = getByTestId('favorite-button');
      fireEvent.press(favoriteButton);

      expect(onFavoriteToggle).toHaveBeenCalledWith('1', false);
    });

    it('does not show favorite button when showFavoriteButton is false', () => {
      const { queryByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={false}
        />
      );

      const favoriteButton = queryByTestId('favorite-button');
      expect(favoriteButton).toBeNull();
    });

    it('does not show favorite button when onFavoriteToggle is not provided', () => {
      const { queryByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          showFavoriteButton={true}
        />
      );

      const favoriteButton = queryByTestId('favorite-button');
      expect(favoriteButton).toBeNull();
    });
  });

  describe('Share functionality', () => {
    it('shows share button when showShareButton is true', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          showShareButton={true}
        />
      );

      const shareButton = getByTestId('share-button');
      expect(shareButton).toBeTruthy();
      expect(shareButton.children[0]).toHaveTextContent('🔗');
    });

    it('calls onShare when share button is pressed and onShare is provided', () => {
      const onShare = jest.fn();
      
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          onShare={onShare}
          showShareButton={true}
        />
      );

      const shareButton = getByTestId('share-button');
      fireEvent.press(shareButton);

      expect(onShare).toHaveBeenCalledWith('1');
    });

    it('uses SharingService when onShare is not provided', async () => {
      (SharingService.shareJokeOptimized as jest.Mock).mockResolvedValue(true);
      
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          showShareButton={true}
        />
      );

      const shareButton = getByTestId('share-button');
      fireEvent.press(shareButton);

      await waitFor(() => {
        expect(SharingService.shareJokeOptimized).toHaveBeenCalledWith(
          mockJoke,
          {
            includeMetadata: true,
            includeAppName: true,
          }
        );
      });
    });

    it('does not show share button when showShareButton is false', () => {
      const { queryByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          showShareButton={false}
        />
      );

      const shareButton = queryByTestId('share-button');
      expect(shareButton).toBeNull();
    });
  });

  describe('Action buttons container', () => {
    it('shows action buttons container when active and not screen reader enabled', () => {
      const { queryByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
          showShareButton={true}
        />
      );

      const favoriteButton = queryByTestId('favorite-button');
      const shareButton = queryByTestId('share-button');
      
      expect(favoriteButton).toBeTruthy();
      expect(shareButton).toBeTruthy();
    });

    it('does not show action buttons when not active', () => {
      const { queryByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={false}
          isFavorite={false}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
          showShareButton={true}
        />
      );

      const favoriteButton = queryByTestId('favorite-button');
      const shareButton = queryByTestId('share-button');
      
      expect(favoriteButton).toBeNull();
      expect(shareButton).toBeNull();
    });
  });

  describe('Accessibility actions', () => {
    it('includes favorite action in accessibility actions when favoriteToggle is provided', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
        />
      );

      const card = getByTestId('joke-card');
      const accessibilityActions = card.props.accessibilityActions;
      
      expect(accessibilityActions).toContainEqual({
        name: 'favorite',
        label: 'Add to favorites'
      });
    });

    it('shows correct accessibility label for unfavorite action', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={true}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
        />
      );

      const card = getByTestId('joke-card');
      const accessibilityActions = card.props.accessibilityActions;
      
      expect(accessibilityActions).toContainEqual({
        name: 'favorite',
        label: 'Remove from favorites'
      });
    });

    it('includes share action in accessibility actions when showShareButton is true', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          showShareButton={true}
        />
      );

      const card = getByTestId('joke-card');
      const accessibilityActions = card.props.accessibilityActions;
      
      expect(accessibilityActions).toContainEqual({
        name: 'share',
        label: 'Share this joke'
      });
    });

    it('handles accessibility favorite action correctly', () => {
      const onFavoriteToggle = jest.fn();
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={onFavoriteToggle}
          showFavoriteButton={true}
        />
      );

      const card = getByTestId('joke-card');
      fireEvent(card, 'accessibilityAction', {
        nativeEvent: { actionName: 'favorite' }
      });

      expect(onFavoriteToggle).toHaveBeenCalledWith('1', true);
    });

    it('handles accessibility share action correctly', async () => {
      (SharingService.shareJokeOptimized as jest.Mock).mockResolvedValue(true);
      
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          showShareButton={true}
        />
      );

      const card = getByTestId('joke-card');
      fireEvent(card, 'accessibilityAction', {
        nativeEvent: { actionName: 'share' }
      });

      await waitFor(() => {
        expect(SharingService.shareJokeOptimized).toHaveBeenCalled();
      });
    });
  });

  describe('Button styling', () => {
    it('applies correct styles to favorite button', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          isFavorite={false}
          onFavoriteToggle={jest.fn()}
          showFavoriteButton={true}
        />
      );

      const favoriteButton = getByTestId('favorite-button');
      expect(favoriteButton.props.style).toContainEqual(
        expect.objectContaining({
          backgroundColor: 'rgba(255, 152, 0, 0.9)',
        })
      );
    });

    it('applies correct styles to share button', () => {
      const { getByTestId } = render(
        <JokeCard
          joke={mockJoke}
          onSwipeLeft={jest.fn()}
          onSwipeRight={jest.fn()}
          isActive={true}
          showShareButton={true}
        />
      );

      const shareButton = getByTestId('share-button');
      expect(shareButton.props.style).toContainEqual(
        expect.objectContaining({
          backgroundColor: 'rgba(96, 125, 139, 0.9)',
        })
      );
    });
  });
});