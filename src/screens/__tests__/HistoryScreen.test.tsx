import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HistoryScreen } from '../HistoryScreen';
import { FeedbackRepository } from '../../services/database/repositories/FeedbackRepository';
import { FavoritesRepository } from '../../services/database/repositories/FavoritesRepository';
import { SharingService } from '../../services/SharingService';

// Mock the repositories
jest.mock('../../services/database/repositories/FeedbackRepository');
jest.mock('../../services/database/repositories/FavoritesRepository');
jest.mock('../../services/SharingService');

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

// Mock AccessibilityInfo
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  AccessibilityInfo: {
    announceForAccessibility: jest.fn(),
  },
}));

const Stack = createNativeStackNavigator();

const mockHistoryJokes = [
  {
    id: '1',
    txt: 'Why did the chicken cross the road?',
    lang: 'en',
    style: 'general',
    topic: 'animals',
    tone: 'light',
    format: 'qa',
    user_sentiment: 'like' as const,
  },
  {
    id: '2',
    txt: 'What do you call a bear with no teeth? A gummy bear!',
    lang: 'en',
    style: 'pun',
    topic: 'animals',
    tone: 'silly',
    format: 'qa',
    user_sentiment: 'neutral' as const,
  },
];

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen name="History" component={() => <>{children}</>} />
    </Stack.Navigator>
  </NavigationContainer>
);

describe('HistoryScreen', () => {
  const mockFeedbackRepo = new FeedbackRepository() as jest.Mocked<FeedbackRepository>;
  const mockFavoritesRepo = new FavoritesRepository() as jest.Mocked<FavoritesRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mocks
    mockFeedbackRepo.getJokesWithFeedback.mockResolvedValue(mockHistoryJokes);
    mockFavoritesRepo.areFavorites.mockResolvedValue(new Map([[1, false], [2, true]]));
    (SharingService.shareJokeOptimized as jest.Mock).mockResolvedValue(true);
  });

  const renderHistoryScreen = () => {
    return render(
      <TestWrapper>
        <HistoryScreen 
          navigation={{ goBack: mockGoBack } as any} 
          route={{} as any}
        />
      </TestWrapper>
    );
  };

  it('renders correctly with loading state', () => {
    const { getByText } = renderHistoryScreen();
    
    expect(getByText('Loading history...')).toBeTruthy();
  });

  it('displays history jokes after loading', async () => {
    const { getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('Why did the chicken cross the road?')).toBeTruthy();
      expect(getByText('What do you call a bear with no teeth? A gummy bear!')).toBeTruthy();
    });
  });

  it('shows empty state when no jokes', async () => {
    mockFeedbackRepo.getJokesWithFeedback.mockResolvedValue([]);
    
    const { getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('No jokes in history')).toBeTruthy();
      expect(getByText('Start viewing jokes to build your history!')).toBeTruthy();
    });
  });

  it('handles search functionality', async () => {
    const { getByPlaceholderText, getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('Why did the chicken cross the road?')).toBeTruthy();
    });

    const searchInput = getByPlaceholderText('Search jokes...');
    fireEvent.changeText(searchInput, 'chicken');
    
    // Wait for debounced search
    await waitFor(() => {
      expect(mockFeedbackRepo.getJokesWithFeedback).toHaveBeenCalledTimes(2); // Initial load + search
    }, { timeout: 500 });
  });

  it('filters by sentiment', async () => {
    const { getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('All Reactions')).toBeTruthy();
    });

    const sentimentFilter = getByText('All Reactions');
    fireEvent.press(sentimentFilter);
    
    await waitFor(() => {
      expect(getByText('👍 Liked')).toBeTruthy();
    });
  });

  it('clears search when clear button is pressed', async () => {
    const { getByPlaceholderText, queryByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(queryByText('Loading history...')).toBeNull();
    });

    const searchInput = getByPlaceholderText('Search jokes...');
    fireEvent.changeText(searchInput, 'test search');
    
    // The clear button should appear
    await waitFor(() => {
      const clearButton = queryByText('✕');
      if (clearButton) {
        fireEvent.press(clearButton);
      }
    });
  });

  it('handles refresh correctly', async () => {
    const { getByTestId } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(mockFeedbackRepo.getJokesWithFeedback).toHaveBeenCalledTimes(1);
    });

    // Simulate pull to refresh
    const flatList = getByTestId('joke-history-list') || screen.getByText('Why did the chicken cross the road?').parent;
    if (flatList) {
      fireEvent(flatList, 'refresh');
      
      await waitFor(() => {
        expect(mockFeedbackRepo.getJokesWithFeedback).toHaveBeenCalledTimes(2);
      });
    }
  });

  it('toggles favorite status', async () => {
    mockFavoritesRepo.toggle.mockResolvedValue(true);
    
    const { getAllByTestId } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(mockFeedbackRepo.getJokesWithFeedback).toHaveBeenCalled();
    });

    // Wait for favorite buttons to appear
    await waitFor(() => {
      const favoriteButtons = getAllByTestId('favorite-button');
      expect(favoriteButtons.length).toBeGreaterThan(0);
      
      fireEvent.press(favoriteButtons[0]);
    });

    await waitFor(() => {
      expect(mockFavoritesRepo.toggle).toHaveBeenCalledWith('current_user', 1);
    });
  });

  it('shares jokes correctly', async () => {
    const { getAllByTestId } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(mockFeedbackRepo.getJokesWithFeedback).toHaveBeenCalled();
    });

    // Wait for share buttons to appear
    await waitFor(() => {
      const shareButtons = getAllByTestId('share-button');
      expect(shareButtons.length).toBeGreaterThan(0);
      
      fireEvent.press(shareButtons[0]);
    });

    await waitFor(() => {
      expect(SharingService.shareJokeOptimized).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          txt: 'Why did the chicken cross the road?'
        }),
        {
          includeMetadata: true,
          includeAppName: true,
        }
      );
    });
  });

  it('handles loading errors gracefully', async () => {
    mockFeedbackRepo.getJokesWithFeedback.mockRejectedValue(new Error('Load error'));
    
    renderHistoryScreen();
    
    await waitFor(() => {
      // Should show error but not crash
      expect(mockFeedbackRepo.getJokesWithFeedback).toHaveBeenCalled();
    });
  });

  it('navigates back when back button is pressed', async () => {
    const { getByText } = renderHistoryScreen();
    
    const backButton = getByText('←');
    fireEvent.press(backButton);
    
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('shows correct sentiment indicators', async () => {
    const { getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      // Should show sentiment indicators for jokes
      expect(getByText('👍')).toBeTruthy(); // Like indicator
      expect(getByText('➖')).toBeTruthy(); // Neutral indicator
    });
  });

  it('filters by language correctly', async () => {
    const { getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('All Languages')).toBeTruthy();
    });

    const languageFilter = getByText('All Languages');
    fireEvent.press(languageFilter);
    
    await waitFor(() => {
      expect(getByText('EN')).toBeTruthy();
    });
  });

  it('shows filtered empty state correctly', async () => {
    const { getByPlaceholderText, getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('Why did the chicken cross the road?')).toBeTruthy();
    });

    // Search for something that won't match
    const searchInput = getByPlaceholderText('Search jokes...');
    fireEvent.changeText(searchInput, 'nonexistent joke');
    
    await waitFor(() => {
      expect(getByText('No jokes match your current filters. Try adjusting your search.')).toBeTruthy();
      expect(getByText('Clear Filters')).toBeTruthy();
    });
  });

  it('clears filters when clear filters button is pressed', async () => {
    const { getByPlaceholderText, getByText } = renderHistoryScreen();
    
    await waitFor(() => {
      expect(getByText('Why did the chicken cross the road?')).toBeTruthy();
    });

    // Add some filters
    const searchInput = getByPlaceholderText('Search jokes...');
    fireEvent.changeText(searchInput, 'test');
    
    await waitFor(() => {
      const clearFiltersButton = getByText('Clear Filters');
      fireEvent.press(clearFiltersButton);
    });
    
    // Should reset search
    expect(searchInput.props.value).toBe('');
  });
});