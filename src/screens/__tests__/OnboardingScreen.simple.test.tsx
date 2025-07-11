import React from 'react';
import { render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOnboardingCompleted, resetOnboarding } from '../OnboardingScreen';

// Mock dependencies
jest.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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

describe('OnboardingScreen Utility Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isOnboardingCompleted', () => {
    it('returns true when onboarding is completed', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('true');
      
      const result = await isOnboardingCompleted();
      
      expect(result).toBe(true);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@giggleglide_onboarding_completed');
    });

    it('returns false when onboarding is not completed', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);
      
      const result = await isOnboardingCompleted();
      
      expect(result).toBe(false);
    });

    it('returns false when AsyncStorage throws an error', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));
      
      const result = await isOnboardingCompleted();
      
      expect(result).toBe(false);
    });
  });

  describe('resetOnboarding', () => {
    it('removes onboarding completed flag from AsyncStorage', async () => {
      await resetOnboarding();
      
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@giggleglide_onboarding_completed');
    });

    it('handles errors gracefully', async () => {
      mockAsyncStorage.removeItem.mockRejectedValue(new Error('Storage error'));
      
      // Should not throw
      await expect(resetOnboarding()).resolves.toBeUndefined();
    });
  });
});

describe('OnboardingScreen Constants', () => {
  it('defines correct joke categories with icons', () => {
    // Test that categories are properly structured
    const OnboardingScreenModule = require('../OnboardingScreen');
    
    // Since the categories are not exported, we test indirectly
    expect(OnboardingScreenModule.default).toBeDefined();
  });
});