import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  RefreshControl,
  AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { Joke, JokeWithFeedback, JokeFilters, Sentiment } from '../services/database/types';
import { DatabaseService } from '../services/database/DatabaseService';
import { FavoritesRepository } from '../services/database/repositories/FavoritesRepository';
import { FeedbackRepository } from '../services/database/repositories/FeedbackRepository';
import { SharingService } from '../services/SharingService';
import JokeCard from '../components/JokeCard';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type HistoryScreenProps = NativeStackScreenProps<RootStackParamList, 'History'>;

interface HistoryItem extends JokeWithFeedback {
  id: string;
  viewed_at?: string;
}

interface FilterState {
  language: string;
  sentiment: Sentiment | 'all';
  searchQuery: string;
}

const ITEMS_PER_PAGE = 20;

export const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    language: 'all',
    sentiment: 'all',
    searchQuery: '',
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  
  const currentPage = useRef(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const flatListRef = useRef<FlatList>(null);
  const searchInputRef = useRef<TextInput>(null);

  const favoritesRepo = new FavoritesRepository();
  const feedbackRepo = new FeedbackRepository();

  // Load history data
  const loadHistory = useCallback(async (page: number = 0, reset: boolean = false) => {
    try {
      if (page === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Mock user ID - in real app this would come from auth
      const userId = 'current_user';
      
      // Get viewed jokes with feedback and favorite status
      const viewedJokes = await feedbackRepo.getJokesWithFeedback(userId, {
        offset: page * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
      });

      // Apply filters
      let filteredJokes = viewedJokes.filter(joke => {
        // Language filter
        if (filters.language !== 'all' && joke.lang !== filters.language) {
          return false;
        }
        
        // Sentiment filter
        if (filters.sentiment !== 'all' && joke.user_sentiment !== filters.sentiment) {
          return false;
        }
        
        // Search filter
        if (filters.searchQuery.trim()) {
          const searchLower = filters.searchQuery.toLowerCase();
          return (
            joke.txt.toLowerCase().includes(searchLower) ||
            joke.topic?.toLowerCase().includes(searchLower) ||
            joke.style?.toLowerCase().includes(searchLower) ||
            joke.tone?.toLowerCase().includes(searchLower)
          );
        }
        
        return true;
      });

      // Convert to HistoryItem format
      const historyItems: HistoryItem[] = filteredJokes.map(joke => ({
        ...joke,
        id: joke.id?.toString() || '',
      }));

      if (reset || page === 0) {
        setHistory(historyItems);
        currentPage.current = 0;
      } else {
        setHistory(prev => [...prev, ...historyItems]);
      }

      setHasMore(historyItems.length === ITEMS_PER_PAGE);
      currentPage.current = page;

      // Load favorites status
      const jokeIds = historyItems.map(joke => parseInt(joke.id)).filter(id => !isNaN(id));
      if (jokeIds.length > 0) {
        const favoriteMap = await favoritesRepo.areFavorites(userId, jokeIds);
        const favoriteSet = new Set<string>();
        favoriteMap.forEach((isFav, jokeId) => {
          if (isFav) favoriteSet.add(jokeId.toString());
        });
        setFavorites(favoriteSet);
      }

    } catch (error) {
      console.error('Error loading history:', error);
      Alert.alert(
        'Error',
        'Failed to load joke history. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [filters]);

  // Initial load
  useEffect(() => {
    loadHistory(0, true);
  }, [loadHistory]);

  // Search debouncing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      loadHistory(0, true);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [filters.searchQuery]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadHistory(0, true);
  }, [loadHistory]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadHistory(currentPage.current + 1, false);
    }
  }, [loadHistory, loadingMore, hasMore]);

  // Favorite toggle handler
  const handleFavoriteToggle = useCallback(async (jokeId: string, isFavorite: boolean) => {
    try {
      const userId = 'current_user';
      const jokeIdNum = parseInt(jokeId);
      
      if (isNaN(jokeIdNum)) return;

      const newIsFavorite = await favoritesRepo.toggle(userId, jokeIdNum);
      
      setFavorites(prev => {
        const newSet = new Set(prev);
        if (newIsFavorite) {
          newSet.add(jokeId);
        } else {
          newSet.delete(jokeId);
        }
        return newSet;
      });

      // Announce to screen reader
      AccessibilityInfo.announceForAccessibility(
        newIsFavorite ? 'Added to favorites' : 'Removed from favorites'
      );

    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'Failed to update favorites. Please try again.');
    }
  }, [favoritesRepo]);

  // Share handler
  const handleShare = useCallback(async (jokeId: string) => {
    const joke = history.find(h => h.id === jokeId);
    if (joke) {
      await SharingService.shareJokeOptimized(joke, {
        includeMetadata: true,
        includeAppName: true,
      });
    }
  }, [history]);

  // Filter handlers
  const handleLanguageFilter = useCallback((language: string) => {
    setFilters(prev => ({ ...prev, language }));
  }, []);

  const handleSentimentFilter = useCallback((sentiment: Sentiment | 'all') => {
    setFilters(prev => ({ ...prev, sentiment }));
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setFilters(prev => ({ ...prev, searchQuery: text }));
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({
      language: 'all',
      sentiment: 'all',
      searchQuery: '',
    });
    if (searchInputRef.current) {
      searchInputRef.current.clear();
    }
  }, []);

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📚</Text>
      <Text style={styles.emptyTitle}>No jokes in history</Text>
      <Text style={styles.emptyDescription}>
        {filters.searchQuery || filters.language !== 'all' || filters.sentiment !== 'all'
          ? 'No jokes match your current filters. Try adjusting your search.'
          : 'Start viewing jokes to build your history!'}
      </Text>
      {(filters.searchQuery || filters.language !== 'all' || filters.sentiment !== 'all') && (
        <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
          <Text style={styles.clearFiltersText}>Clear Filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Render joke item
  const renderJokeItem = ({ item, index }: { item: HistoryItem; index: number }) => (
    <View style={styles.jokeItemContainer}>
      <JokeCard
        joke={item}
        onSwipeLeft={() => {}} // History items don't need swipe actions
        onSwipeRight={() => {}}
        isActive={false} // Disable swiping in history
        isFavorite={favorites.has(item.id)}
        onFavoriteToggle={handleFavoriteToggle}
        onShare={handleShare}
        showFavoriteButton={true}
        showShareButton={true}
        reducedMotion={true} // Disable animations for performance
      />
      
      {/* Sentiment indicator */}
      {item.user_sentiment && (
        <View style={styles.sentimentIndicator}>
          <Text style={[
            styles.sentimentText,
            item.user_sentiment === 'like' && styles.sentimentLike,
            item.user_sentiment === 'dislike' && styles.sentimentDislike,
            item.user_sentiment === 'neutral' && styles.sentimentNeutral,
          ]}>
            {item.user_sentiment === 'like' ? '👍' : 
             item.user_sentiment === 'dislike' ? '👎' : '➖'}
          </Text>
        </View>
      )}
    </View>
  );

  // Render filter bar
  const renderFilterBar = () => (
    <View style={styles.filterContainer}>
      <View style={styles.filterRow}>
        {/* Language filter */}
        <TouchableOpacity
          style={[styles.filterButton, filters.language !== 'all' && styles.filterButtonActive]}
          onPress={() => {
            // Toggle between current language and 'all'
            handleLanguageFilter(filters.language === 'all' ? 'en' : 'all');
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Language filter: ${filters.language}`}
        >
          <Text style={[styles.filterButtonText, filters.language !== 'all' && styles.filterButtonTextActive]}>
            {filters.language === 'all' ? 'All Languages' : filters.language.toUpperCase()}
          </Text>
        </TouchableOpacity>

        {/* Sentiment filter */}
        <TouchableOpacity
          style={[styles.filterButton, filters.sentiment !== 'all' && styles.filterButtonActive]}
          onPress={() => {
            // Cycle through sentiments
            const sentiments: (Sentiment | 'all')[] = ['all', 'like', 'dislike', 'neutral'];
            const currentIndex = sentiments.indexOf(filters.sentiment);
            const nextIndex = (currentIndex + 1) % sentiments.length;
            handleSentimentFilter(sentiments[nextIndex]);
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Sentiment filter: ${filters.sentiment}`}
        >
          <Text style={[styles.filterButtonText, filters.sentiment !== 'all' && styles.filterButtonTextActive]}>
            {filters.sentiment === 'all' ? 'All Reactions' :
             filters.sentiment === 'like' ? '👍 Liked' :
             filters.sentiment === 'dislike' ? '👎 Disliked' : '➖ Neutral'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Joke History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search jokes..."
          placeholderTextColor="rgba(255, 255, 255, 0.7)"
          value={filters.searchQuery}
          onChangeText={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          accessible={true}
          accessibilityLabel="Search jokes"
          accessibilityHint="Enter text to search through your joke history"
        />
        {filters.searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearSearchButton}
            onPress={() => handleSearchChange('')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter bar */}
      {renderFilterBar()}

      {/* History list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={history}
          renderItem={renderJokeItem}
          keyExtractor={(item) => item.id}
          style={styles.historyList}
          contentContainerStyle={[
            styles.historyListContent,
            history.length === 0 && styles.historyListContentEmpty
          ]}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
              titleColor="#fff"
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => (
            loadingMore ? (
              <View style={styles.loadMoreContainer}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : null
          )}
          showsVerticalScrollIndicator={false}
          accessible={true}
          accessibilityLabel="Joke history list"
        />
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 25,
    paddingHorizontal: 15,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: '#fff',
    fontSize: 16,
  },
  clearSearchButton: {
    padding: 5,
  },
  clearSearchText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
  },
  filterContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  filterButtonText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  historyList: {
    flex: 1,
  },
  historyListContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  historyListContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  jokeItemContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  sentimentIndicator: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sentimentText: {
    fontSize: 16,
  },
  sentimentLike: {
    color: '#4CAF50',
  },
  sentimentDislike: {
    color: '#F44336',
  },
  sentimentNeutral: {
    color: '#9E9E9E',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  loadMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  clearFiltersButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  clearFiltersText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HistoryScreen;