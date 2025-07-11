import { createNavigationContainerRef, StackActions } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export class NavigationService {
  private static instance: NavigationService;

  static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  /**
   * Navigate to a specific screen
   */
  navigate<T extends keyof RootStackParamList>(
    name: T,
    params?: RootStackParamList[T]
  ): void {
    if (navigationRef.isReady()) {
      navigationRef.navigate(name, params);
    } else {
      console.warn('Navigation not ready, cannot navigate to:', name);
    }
  }

  /**
   * Reset navigation to a specific screen
   */
  reset<T extends keyof RootStackParamList>(
    name: T,
    params?: RootStackParamList[T]
  ): void {
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name, params }],
      });
    } else {
      console.warn('Navigation not ready, cannot reset to:', name);
    }
  }

  /**
   * Go back to previous screen
   */
  goBack(): void {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }

  /**
   * Push a new screen onto the stack
   */
  push<T extends keyof RootStackParamList>(
    name: T,
    params?: RootStackParamList[T]
  ): void {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(StackActions.push(name, params));
    } else {
      console.warn('Navigation not ready, cannot push:', name);
    }
  }

  /**
   * Handle notification navigation
   */
  handleNotificationNavigation(data: {
    type: string;
    jokeId?: number;
    screen?: string;
  }): void {
    try {
      switch (data.type) {
        case 'daily_joke':
          if (data.jokeId) {
            // Navigate to specific joke
            this.navigateToJoke(data.jokeId);
          } else {
            // Navigate to home for new joke
            this.navigate('Home');
          }
          break;
          
        default:
          console.warn('Unknown notification type:', data.type);
          this.navigate('Home');
          break;
      }
    } catch (error) {
      console.error('Failed to handle notification navigation:', error);
      // Fallback to home screen
      this.navigate('Home');
    }
  }

  /**
   * Navigate to a specific joke
   */
  navigateToJoke(jokeId: number): void {
    try {
      // Check current route
      const currentRoute = navigationRef.getCurrentRoute();
      
      if (currentRoute?.name === 'Home') {
        // If already on home, pass the joke ID as param
        this.navigate('Home', { jokeId });
      } else {
        // Navigate to home with the joke ID
        this.reset('Home', { jokeId });
      }
    } catch (error) {
      console.error('Failed to navigate to joke:', error);
      this.navigate('Home');
    }
  }

  /**
   * Handle deep link URLs
   */
  handleDeepLink(url: string): void {
    try {
      const urlObject = new URL(url);
      const pathSegments = urlObject.pathname.split('/').filter(Boolean);
      
      switch (pathSegments[0]) {
        case 'joke':
          const jokeId = parseInt(pathSegments[1], 10);
          if (!isNaN(jokeId)) {
            this.navigateToJoke(jokeId);
          } else {
            this.navigate('Home');
          }
          break;
          
        case 'favorites':
          this.navigate('Favorites');
          break;
          
        case 'history':
          this.navigate('History');
          break;
          
        case 'settings':
          this.navigate('Settings');
          break;
          
        default:
          this.navigate('Home');
          break;
      }
    } catch (error) {
      console.error('Failed to handle deep link:', error);
      this.navigate('Home');
    }
  }

  /**
   * Get current route name
   */
  getCurrentRouteName(): string | undefined {
    if (navigationRef.isReady()) {
      return navigationRef.getCurrentRoute()?.name;
    }
    return undefined;
  }

  /**
   * Get current route params
   */
  getCurrentRouteParams(): any {
    if (navigationRef.isReady()) {
      return navigationRef.getCurrentRoute()?.params;
    }
    return undefined;
  }

  /**
   * Check if navigation is ready
   */
  isReady(): boolean {
    return navigationRef.isReady();
  }

  /**
   * Wait for navigation to be ready
   */
  async waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      if (navigationRef.isReady()) {
        resolve();
      } else {
        const unsubscribe = navigationRef.addListener('state', () => {
          if (navigationRef.isReady()) {
            unsubscribe();
            resolve();
          }
        });
      }
    });
  }

  /**
   * Generate deep link URL for a joke
   */
  generateJokeDeepLink(jokeId: number): string {
    return `giggleglide://joke/${jokeId}`;
  }

  /**
   * Generate sharing URL for a joke
   */
  generateSharingUrl(jokeId: number): string {
    return `https://giggleglide.com/joke/${jokeId}`;
  }
}

export default NavigationService;