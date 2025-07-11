import NavigationService, { navigationRef } from '../NavigationService';
import { StackActions } from '@react-navigation/native';

// Mock React Navigation
jest.mock('@react-navigation/native', () => ({
  createNavigationContainerRef: jest.fn(() => ({
    isReady: jest.fn(),
    navigate: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    canGoBack: jest.fn(),
    dispatch: jest.fn(),
    getCurrentRoute: jest.fn(),
    addListener: jest.fn(),
  })),
  StackActions: {
    push: jest.fn(),
  },
}));

describe('NavigationService', () => {
  let navigationService: NavigationService;
  let mockNavigationRef: any;

  beforeEach(() => {
    jest.clearAllMocks();
    navigationService = NavigationService.getInstance();
    mockNavigationRef = navigationRef as any;
  });

  describe('Basic Navigation', () => {
    it('should navigate to screen when ready', () => {
      mockNavigationRef.isReady.mockReturnValue(true);

      navigationService.navigate('Home');

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
    });

    it('should navigate to screen with params when ready', () => {
      mockNavigationRef.isReady.mockReturnValue(true);

      navigationService.navigate('Home', { jokeId: 123 });

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', { jokeId: 123 });
    });

    it('should not navigate when not ready', () => {
      mockNavigationRef.isReady.mockReturnValue(false);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      navigationService.navigate('Home');

      expect(mockNavigationRef.navigate).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('Navigation not ready, cannot navigate to:', 'Home');
      
      consoleSpy.mockRestore();
    });

    it('should reset navigation when ready', () => {
      mockNavigationRef.isReady.mockReturnValue(true);

      navigationService.reset('Settings');

      expect(mockNavigationRef.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Settings', params: undefined }],
      });
    });

    it('should go back when ready and can go back', () => {
      mockNavigationRef.isReady.mockReturnValue(true);
      mockNavigationRef.canGoBack.mockReturnValue(true);

      navigationService.goBack();

      expect(mockNavigationRef.goBack).toHaveBeenCalled();
    });

    it('should not go back when cannot go back', () => {
      mockNavigationRef.isReady.mockReturnValue(true);
      mockNavigationRef.canGoBack.mockReturnValue(false);

      navigationService.goBack();

      expect(mockNavigationRef.goBack).not.toHaveBeenCalled();
    });

    it('should push screen when ready', () => {
      mockNavigationRef.isReady.mockReturnValue(true);
      const mockPushAction = { type: 'PUSH' };
      (StackActions.push as jest.Mock).mockReturnValue(mockPushAction);

      navigationService.push('Details', { jokeId: 456 });

      expect(StackActions.push).toHaveBeenCalledWith('Details', { jokeId: 456 });
      expect(mockNavigationRef.dispatch).toHaveBeenCalledWith(mockPushAction);
    });
  });

  describe('Notification Navigation', () => {
    beforeEach(() => {
      mockNavigationRef.isReady.mockReturnValue(true);
    });

    it('should navigate to specific joke for daily_joke notification', () => {
      const data = {
        type: 'daily_joke',
        jokeId: 123,
      };

      navigationService.handleNotificationNavigation(data);

      expect(mockNavigationRef.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Home', params: { jokeId: 123 } }],
      });
    });

    it('should navigate to home for daily_joke notification without jokeId', () => {
      const data = {
        type: 'daily_joke',
      };

      navigationService.handleNotificationNavigation(data);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
    });

    it('should navigate to home for unknown notification type', () => {
      const data = {
        type: 'unknown_type',
      };
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      navigationService.handleNotificationNavigation(data);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
      expect(consoleSpy).toHaveBeenCalledWith('Unknown notification type:', 'unknown_type');
      
      consoleSpy.mockRestore();
    });

    it('should handle navigation errors gracefully', () => {
      const data = {
        type: 'daily_joke',
        jokeId: 123,
      };
      mockNavigationRef.reset.mockImplementation(() => {
        throw new Error('Navigation error');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      navigationService.handleNotificationNavigation(data);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to handle notification navigation:', expect.any(Error));
      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Joke Navigation', () => {
    beforeEach(() => {
      mockNavigationRef.isReady.mockReturnValue(true);
    });

    it('should navigate to joke from Home screen', () => {
      mockNavigationRef.getCurrentRoute.mockReturnValue({ name: 'Home' });

      navigationService.navigateToJoke(456);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', { jokeId: 456 });
    });

    it('should reset to home with joke from other screens', () => {
      mockNavigationRef.getCurrentRoute.mockReturnValue({ name: 'Settings' });

      navigationService.navigateToJoke(789);

      expect(mockNavigationRef.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Home', params: { jokeId: 789 } }],
      });
    });

    it('should handle joke navigation errors', () => {
      mockNavigationRef.getCurrentRoute.mockImplementation(() => {
        throw new Error('Route error');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      navigationService.navigateToJoke(999);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to navigate to joke:', expect.any(Error));
      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
      
      consoleSpy.mockRestore();
    });
  });

  describe('Deep Link Handling', () => {
    beforeEach(() => {
      mockNavigationRef.isReady.mockReturnValue(true);
    });

    it('should handle joke deep link', () => {
      const url = 'giggleglide://joke/123';

      navigationService.handleDeepLink(url);

      expect(mockNavigationRef.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Home', params: { jokeId: 123 } }],
      });
    });

    it('should handle joke deep link with invalid ID', () => {
      const url = 'giggleglide://joke/invalid';

      navigationService.handleDeepLink(url);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
    });

    it('should handle favorites deep link', () => {
      const url = 'giggleglide://favorites';

      navigationService.handleDeepLink(url);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Favorites', undefined);
    });

    it('should handle history deep link', () => {
      const url = 'giggleglide://history';

      navigationService.handleDeepLink(url);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('History', undefined);
    });

    it('should handle settings deep link', () => {
      const url = 'giggleglide://settings';

      navigationService.handleDeepLink(url);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Settings', undefined);
    });

    it('should handle unknown deep link', () => {
      const url = 'giggleglide://unknown';

      navigationService.handleDeepLink(url);

      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
    });

    it('should handle invalid deep link URL', () => {
      const url = 'invalid-url';
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      navigationService.handleDeepLink(url);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to handle deep link:', expect.any(Error));
      expect(mockNavigationRef.navigate).toHaveBeenCalledWith('Home', undefined);
      
      consoleSpy.mockRestore();
    });
  });

  describe('State Queries', () => {
    it('should get current route name when ready', () => {
      mockNavigationRef.isReady.mockReturnValue(true);
      mockNavigationRef.getCurrentRoute.mockReturnValue({ name: 'Home' });

      const routeName = navigationService.getCurrentRouteName();

      expect(routeName).toBe('Home');
    });

    it('should return undefined when not ready', () => {
      mockNavigationRef.isReady.mockReturnValue(false);

      const routeName = navigationService.getCurrentRouteName();

      expect(routeName).toBeUndefined();
    });

    it('should get current route params when ready', () => {
      const params = { jokeId: 123 };
      mockNavigationRef.isReady.mockReturnValue(true);
      mockNavigationRef.getCurrentRoute.mockReturnValue({ params });

      const routeParams = navigationService.getCurrentRouteParams();

      expect(routeParams).toEqual(params);
    });

    it('should check if ready', () => {
      mockNavigationRef.isReady.mockReturnValue(true);

      const isReady = navigationService.isReady();

      expect(isReady).toBe(true);
    });
  });

  describe('Wait for Ready', () => {
    it('should resolve immediately when already ready', async () => {
      mockNavigationRef.isReady.mockReturnValue(true);

      await expect(navigationService.waitForReady()).resolves.toBeUndefined();
    });

    it('should wait for ready state', async () => {
      let isReady = false;
      let listener: () => void;

      mockNavigationRef.isReady.mockImplementation(() => isReady);
      mockNavigationRef.addListener.mockImplementation((event: string, callback: () => void) => {
        if (event === 'state') {
          listener = callback;
          return () => {}; // unsubscribe function
        }
      });

      const waitPromise = navigationService.waitForReady();

      // Simulate navigation becoming ready
      setTimeout(() => {
        isReady = true;
        listener();
      }, 10);

      await expect(waitPromise).resolves.toBeUndefined();
    });
  });

  describe('URL Generation', () => {
    it('should generate joke deep link', () => {
      const url = navigationService.generateJokeDeepLink(123);

      expect(url).toBe('giggleglide://joke/123');
    });

    it('should generate sharing URL', () => {
      const url = navigationService.generateSharingUrl(456);

      expect(url).toBe('https://giggleglide.com/joke/456');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = NavigationService.getInstance();
      const instance2 = NavigationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});