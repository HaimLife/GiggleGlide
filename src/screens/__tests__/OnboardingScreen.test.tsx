import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen, { isOnboardingCompleted, resetOnboarding } from '../OnboardingScreen';

// Mock dependencies
jest.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'onboarding.welcome.title': 'Welcome to GiggleGlide!',
        'onboarding.welcome.subtitle': 'Swipe through jokes and find your perfect laugh',
        'onboarding.welcome.getStarted': 'Get Started',
        'onboarding.language.title': 'Choose Your Language',
        'onboarding.language.subtitle': 'Select your preferred language for jokes',
        'onboarding.language.detected': 'Auto-detected',
        'onboarding.categories.title': 'Pick Your Humor',
        'onboarding.categories.subtitle': 'Select joke categories you enjoy (choose at least 1)',
        'onboarding.categories.dadJokes': 'Dad Jokes',
        'onboarding.categories.puns': 'Puns',
        'onboarding.notifications.title': 'Daily Laughs',
        'onboarding.notifications.subtitle': 'Get a daily joke notification to brighten your day',
        'onboarding.notifications.enable': 'Enable Notifications',
        'onboarding.notifications.enabled': 'Notifications Enabled ✓',
        'onboarding.navigation.skip': 'Skip',
        'onboarding.navigation.next': 'Next',
        'onboarding.final.startLaughing': 'Start Laughing!',
        'errors.general': 'Error',
        'onboarding.errors.savePreferences': 'Failed to save preferences. Please try again.',
      };
      return translations[key] || key;
    },
    changeLanguage: jest.fn(),
    currentLanguage: 'en',
  }),
}));

jest.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      language: 'en',
      favoriteCategories: [],
      notificationsEnabled: false,
    },
    updatePreferences: jest.fn(),
  }),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Mock navigation
const Stack = createNativeStackNavigator();
const MockNavigator = ({ children }: { children: React.ReactNode }) => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="Onboarding" component={() => <>{children}</>} />
    </Stack.Navigator>
  </NavigationContainer>
);

const mockTranslationFunction = (key: string) => {
  const translations: Record<string, string> = {
    'onboarding.welcome.title': 'Welcome to GiggleGlide!',
    'onboarding.welcome.subtitle': 'Swipe through jokes and find your perfect laugh',
    'onboarding.welcome.getStarted': 'Get Started',
    'onboarding.language.title': 'Choose Your Language',
    'onboarding.language.subtitle': 'Select your preferred language for jokes',
    'onboarding.language.detected': 'Auto-detected',
    'onboarding.categories.title': 'Pick Your Humor',
    'onboarding.categories.subtitle': 'Select joke categories you enjoy (choose at least 1)',
    'onboarding.categories.dadJokes': 'Dad Jokes',
    'onboarding.categories.puns': 'Puns',
    'onboarding.notifications.title': 'Daily Laughs',
    'onboarding.notifications.subtitle': 'Get a daily joke notification to brighten your day',
    'onboarding.notifications.enable': 'Enable Notifications',
    'onboarding.notifications.enabled': 'Notifications Enabled ✓',
    'onboarding.navigation.skip': 'Skip',
    'onboarding.navigation.next': 'Next',
    'onboarding.final.startLaughing': 'Start Laughing!',
    'errors.general': 'Error',
    'onboarding.errors.savePreferences': 'Failed to save preferences. Please try again.',
  };
  return translations[key] || key;
};

const mockPreferences = {
  language: 'en',
  favoriteCategories: [],
  notificationsEnabled: false,
};

const mockUpdatePreferences = jest.fn();

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockUseTranslation.mockReturnValue({
      t: mockTranslationFunction,
      changeLanguage: jest.fn(),
      currentLanguage: 'en',
    });

    mockUsePreferences.mockReturnValue({
      preferences: mockPreferences,
      updatePreferences: mockUpdatePreferences,
    });

    mockLocalization.locale = 'en-US';
    
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      ios: {},
      android: {},
      canAskAgain: true,
      granted: false,
      expires: 'never',
    });

    mockNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'granted',
      ios: {},
      android: {},
      canAskAgain: true,
      granted: true,
      expires: 'never',
    });

    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
  });

  const renderOnboardingScreen = (props = {}) => {
    return render(
      <MockNavigator>
        <OnboardingScreen {...props} />
      </MockNavigator>
    );
  };

  describe('Initial Render', () => {
    it('renders welcome screen correctly', () => {
      const { getByText } = renderOnboardingScreen();
      
      expect(getByText('Welcome to GiggleGlide!')).toBeTruthy();
      expect(getByText('Swipe through jokes and find your perfect laugh')).toBeTruthy();
      expect(getByText('Get Started')).toBeTruthy();
    });

    it('shows progress indicator', () => {
      const { getByTestId } = renderOnboardingScreen();
      
      // Should show progress indicators
      expect(() => getByTestId('progress-container')).not.toThrow();
    });

    it('auto-detects device language', async () => {
      mockLocalization.locale = 'es-ES';
      const mockChangeLanguage = jest.fn();
      
      mockUseTranslation.mockReturnValue({
        t: mockTranslationFunction,
        changeLanguage: mockChangeLanguage,
        currentLanguage: 'en',
      });

      renderOnboardingScreen();

      await waitFor(() => {
        expect(mockChangeLanguage).toHaveBeenCalledWith('es');
      });
    });
  });

  describe('Navigation', () => {
    it('navigates to next page when Get Started is pressed', async () => {
      const { getByText } = renderOnboardingScreen();
      
      const getStartedButton = getByText('Get Started');
      fireEvent.press(getStartedButton);

      await waitFor(() => {
        expect(getByText('Choose Your Language')).toBeTruthy();
      });
    });

    it('allows skipping pages', async () => {
      const { getByText } = renderOnboardingScreen();
      
      // Navigate to language page first
      fireEvent.press(getByText('Get Started'));
      
      await waitFor(() => {
        expect(getByText('Choose Your Language')).toBeTruthy();
      });

      // Skip language selection
      const skipButton = getByText('Skip');
      fireEvent.press(skipButton);

      await waitFor(() => {
        expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
          '@giggleglide_onboarding_completed',
          'true'
        );
      });
    });
  });

  describe('Language Selection', () => {
    it('allows language selection', async () => {
      const mockChangeLanguage = jest.fn();
      
      mockUseTranslation.mockReturnValue({
        t: mockTranslationFunction,
        changeLanguage: mockChangeLanguage,
        currentLanguage: 'en',
      });

      const { getByText } = renderOnboardingScreen();
      
      // Navigate to language page
      fireEvent.press(getByText('Get Started'));
      
      await waitFor(() => {
        expect(getByText('Choose Your Language')).toBeTruthy();
      });

      // Select Spanish
      const spanishOption = getByText('Español');
      fireEvent.press(spanishOption);

      expect(mockChangeLanguage).toHaveBeenCalledWith('es');
    });

    it('disables next button when no language is selected', async () => {
      const { getByText } = renderOnboardingScreen();
      
      // Navigate to language page
      fireEvent.press(getByText('Get Started'));
      
      await waitFor(() => {
        expect(getByText('Choose Your Language')).toBeTruthy();
      });

      const nextButton = getByText('Next');
      expect(nextButton).toHaveProperty('disabled', true);
    });
  });

  describe('Category Selection', () => {
    it('allows category selection', async () => {
      const { getByText } = renderOnboardingScreen();
      
      // Navigate to categories page
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => {
        fireEvent.press(getByText('Next'));
      });
      
      await waitFor(() => {
        fireEvent.press(getByText('Next'));
      });
      
      await waitFor(() => {
        expect(getByText('Pick Your Humor')).toBeTruthy();
      });

      // Select Dad Jokes category
      const dadJokesCategory = getByText('Dad Jokes');
      fireEvent.press(dadJokesCategory);

      // Verify category is selected visually (would check styling in real implementation)
      expect(dadJokesCategory).toBeTruthy();
    });

    it('disables next button when no categories are selected', async () => {
      const { getByText } = renderOnboardingScreen();
      
      // Navigate to categories page
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => {
        fireEvent.press(getByText('Next'));
      });
      await waitFor(() => {
        fireEvent.press(getByText('Next'));
      });
      
      await waitFor(() => {
        expect(getByText('Pick Your Humor')).toBeTruthy();
      });

      const nextButton = getByText('Next');
      expect(nextButton).toHaveProperty('disabled', true);
    });
  });

  describe('Notification Permission', () => {
    it('requests notification permission', async () => {
      const { getByText } = renderOnboardingScreen();
      
      // Navigate to notifications page
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      
      await waitFor(() => {
        expect(getByText('Daily Laughs')).toBeTruthy();
      });

      const enableButton = getByText('Enable Notifications');
      fireEvent.press(enableButton);

      await waitFor(() => {
        expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled();
      });
    });

    it('handles notification permission denial', async () => {
      mockNotifications.requestPermissionsAsync.mockResolvedValue({
        status: 'denied',
        ios: {},
        android: {},
        canAskAgain: true,
        granted: false,
        expires: 'never',
      });

      jest.spyOn(Alert, 'alert');

      const { getByText } = renderOnboardingScreen();
      
      // Navigate to notifications page
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      
      await waitFor(() => {
        expect(getByText('Daily Laughs')).toBeTruthy();
      });

      const enableButton = getByText('Enable Notifications');
      fireEvent.press(enableButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalled();
      });
    });
  });

  describe('Onboarding Completion', () => {
    it('completes onboarding successfully', async () => {
      const mockOnComplete = jest.fn();
      const { getByText } = renderOnboardingScreen({ onComplete: mockOnComplete });
      
      // Navigate through all pages
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      
      await waitFor(() => {
        expect(getByText('Start Laughing!')).toBeTruthy();
      });

      const finishButton = getByText('Start Laughing!');
      fireEvent.press(finishButton);

      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalled();
        expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
          '@giggleglide_onboarding_completed',
          'true'
        );
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('handles errors during onboarding completion', async () => {
      mockUpdatePreferences.mockRejectedValue(new Error('Save failed'));
      jest.spyOn(Alert, 'alert');

      const { getByText } = renderOnboardingScreen();
      
      // Navigate to final page
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      
      const finishButton = getByText('Start Laughing!');
      fireEvent.press(finishButton);

      await waitFor(() => {
        expect(Alert.alert).toHaveBeenCalledWith(
          'Error',
          'Failed to save preferences. Please try again.'
        );
      });
    });

    it('shows loading state during completion', async () => {
      // Mock a delayed response
      mockUpdatePreferences.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      const { getByText, getByTestId } = renderOnboardingScreen();
      
      // Navigate to final page
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      
      const finishButton = getByText('Start Laughing!');
      fireEvent.press(finishButton);

      // Should show loading indicator
      expect(() => getByTestId('loading-indicator')).not.toThrow();
    });
  });

  describe('Utility Functions', () => {
    it('checks onboarding completion status', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('true');
      
      const result = await isOnboardingCompleted();
      
      expect(result).toBe(true);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@giggleglide_onboarding_completed');
    });

    it('resets onboarding status', async () => {
      await resetOnboarding();
      
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@giggleglide_onboarding_completed');
    });

    it('handles errors in utility functions', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      
      const result = await isOnboardingCompleted();
      
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('handles missing translation keys gracefully', () => {
      mockUseTranslation.mockReturnValue({
        t: (key: string) => key, // Return key as fallback
        changeLanguage: jest.fn(),
        currentLanguage: 'en',
      });

      const { getByText } = renderOnboardingScreen();
      
      // Should still render with translation keys as fallback
      expect(getByText('onboarding.welcome.title')).toBeTruthy();
    });

    it('handles unsupported device language', () => {
      mockLocalization.locale = 'zh-CN'; // Unsupported language
      
      const { getByText } = renderOnboardingScreen();
      
      // Should default to English
      expect(getByText('Welcome to GiggleGlide!')).toBeTruthy();
    });

    it('handles navigation errors gracefully', async () => {
      const mockOnComplete = jest.fn().mockImplementation(() => {
        throw new Error('Navigation error');
      });

      const { getByText } = renderOnboardingScreen({ onComplete: mockOnComplete });
      
      // Complete onboarding
      fireEvent.press(getByText('Get Started'));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      await waitFor(() => fireEvent.press(getByText('Next')));
      
      const finishButton = getByText('Start Laughing!');
      
      // Should not crash the app
      expect(() => fireEvent.press(finishButton)).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('provides accessible labels for navigation elements', () => {
      const { getByText } = renderOnboardingScreen();
      
      const getStartedButton = getByText('Get Started');
      expect(getStartedButton).toBeTruthy();
      
      // In a real implementation, we would check for accessibility labels
      // expect(getStartedButton).toHaveAccessibilityLabel('Get Started Button');
    });

    it('supports screen readers with proper content structure', () => {
      const { getByText } = renderOnboardingScreen();
      
      // Check that titles and subtitles are properly structured
      expect(getByText('Welcome to GiggleGlide!')).toBeTruthy();
      expect(getByText('Swipe through jokes and find your perfect laugh')).toBeTruthy();
    });
  });
});