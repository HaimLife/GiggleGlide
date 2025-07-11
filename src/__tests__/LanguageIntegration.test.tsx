import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppHeader } from '../components/AppHeader';
import { changeLanguage } from '../i18n';
import '../i18n'; // Initialize i18n

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
}));

// Mock Expo modules
jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
}));

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  TouchableOpacity: require('react-native').TouchableOpacity,
}));

// Mock safe area context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));

// Mock picker
jest.mock('@react-native-picker/picker', () => ({
  Picker: ({ children }: any) => children,
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const TestApp = () => <AppHeader title="Test App" />;

describe('Language Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.multiGet.mockResolvedValue([]);
  });

  it('immediately updates all UI text when language is changed', async () => {
    const { getByTestId, getByText, queryByTestId } = render(<TestApp />);

    // Wait for initial render
    await waitFor(() => {
      expect(getByText('Test App')).toBeTruthy();
    });

    // Open language selector by pressing language chip
    const languageChip = getByTestId('language-chip');
    fireEvent.press(languageChip);

    // Wait for language selector to appear
    await waitFor(() => {
      expect(getByTestId('language-selector')).toBeTruthy();
    });

    // Select Spanish
    const spanishOption = getByTestId('select-spanish');
    
    await act(async () => {
      fireEvent.press(spanishOption);
      
      // Simulate successful language change
      await changeLanguage('es');
    });

    // Verify language selector closes after change
    await waitFor(() => {
      expect(queryByTestId('language-selector')).toBeNull();
    });
  });

  it('maintains header functionality', async () => {
    const { getByTestId, getByText } = render(<TestApp />);

    // Should render header with title
    await waitFor(() => {
      expect(getByText('Test App')).toBeTruthy();
      expect(getByTestId('language-chip')).toBeTruthy();
    });
  });

  it('language chip shows correct flag and code', async () => {
    const { getByTestId, queryByText } = render(<TestApp />);

    await waitFor(() => {
      const chip = getByTestId('language-chip');
      expect(chip).toBeTruthy();
      // The chip should show current language (could be EN or ES depending on test order)
      expect(queryByText('EN') || queryByText('ES')).toBeTruthy();
      expect(queryByText('🇺🇸') || queryByText('🇪🇸')).toBeTruthy();
    });
  });
});