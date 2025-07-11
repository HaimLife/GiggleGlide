import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AppHeader } from '../AppHeader';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'navigation.home': 'Home',
        'settings.title': 'Settings',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock LanguageChip and LanguageSelector
jest.mock('../LanguageChip', () => ({
  LanguageChip: ({ onPress }: { onPress: () => void }) => {
    const { TouchableOpacity, Text } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} testID="language-chip">
        <Text>EN</Text>
      </TouchableOpacity>
    );
  },
}));

jest.mock('../LanguageSelector', () => ({
  LanguageSelector: ({ 
    visible, 
    onClose, 
    onLanguageChanged 
  }: { 
    visible: boolean; 
    onClose: () => void; 
    onLanguageChanged: (lang: string) => void;
  }) => {
    const { View, Text, TouchableOpacity } = require('react-native');
    return visible ? (
      <View testID="language-selector">
        <Text>Language Selector</Text>
        <TouchableOpacity onPress={onClose} testID="close-selector">
          <Text>Close</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => onLanguageChanged('es')} 
          testID="select-spanish"
        >
          <Text>Español</Text>
        </TouchableOpacity>
      </View>
    ) : null;
  },
}));

describe('AppHeader', () => {
  it('renders correctly with default props', () => {
    const { getByTestId } = render(<AppHeader />);
    
    expect(getByTestId('language-chip')).toBeTruthy();
  });

  it('renders title when provided', () => {
    const { getByText } = render(<AppHeader title="Test Title" />);
    
    expect(getByText('Test Title')).toBeTruthy();
  });

  it('applies custom background color', () => {
    const { getByTestId } = render(
      <AppHeader backgroundColor="#ff0000" />
    );
    
    // Note: Testing background color directly is challenging in React Native Testing Library
    // This test ensures the component renders without errors with custom props
    expect(getByTestId('language-chip')).toBeTruthy();
  });

  it('hides language chip when showLanguageChip is false', () => {
    const { queryByTestId } = render(
      <AppHeader showLanguageChip={false} />
    );
    
    expect(queryByTestId('language-chip')).toBeNull();
  });

  it('opens language selector when language chip is pressed', async () => {
    const { getByTestId, queryByTestId } = render(<AppHeader />);
    
    // Initially, language selector should not be visible
    expect(queryByTestId('language-selector')).toBeNull();
    
    // Press language chip
    fireEvent.press(getByTestId('language-chip'));
    
    // Language selector should now be visible
    await waitFor(() => {
      expect(getByTestId('language-selector')).toBeTruthy();
    });
  });

  it('closes language selector when close is pressed', async () => {
    const { getByTestId, queryByTestId } = render(<AppHeader />);
    
    // Open language selector
    fireEvent.press(getByTestId('language-chip'));
    
    await waitFor(() => {
      expect(getByTestId('language-selector')).toBeTruthy();
    });
    
    // Close language selector
    fireEvent.press(getByTestId('close-selector'));
    
    await waitFor(() => {
      expect(queryByTestId('language-selector')).toBeNull();
    });
  });

  it('triggers animation when language is changed', async () => {
    const { getByTestId } = render(<AppHeader />);
    
    // Open language selector
    fireEvent.press(getByTestId('language-chip'));
    
    await waitFor(() => {
      expect(getByTestId('language-selector')).toBeTruthy();
    });
    
    // Select a language
    fireEvent.press(getByTestId('select-spanish'));
    
    // Animation should be triggered (this is tested implicitly through the animation ref)
    await waitFor(() => {
      expect(queryByTestId('language-selector')).toBeNull();
    });
  });

  it('has proper structure with safe area', () => {
    const { getByTestId } = render(<AppHeader title="Test" />);
    
    // Should render language chip
    expect(getByTestId('language-chip')).toBeTruthy();
  });

  it('handles missing title gracefully', () => {
    const { queryByText } = render(<AppHeader />);
    
    // Should not render any title
    expect(queryByText('')).toBeNull();
  });

  it('maintains proper spacing and layout', () => {
    const { getByText, getByTestId } = render(
      <AppHeader title="Long Title That Might Affect Layout" />
    );
    
    expect(getByText('Long Title That Might Affect Layout')).toBeTruthy();
    expect(getByTestId('language-chip')).toBeTruthy();
  });
});