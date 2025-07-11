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
import { Joke, JokeFilters } from '../services/database/types';
import { FavoritesRepository } from '../services/database/repositories/FavoritesRepository';
import { JokeRepository } from '../services/database/repositories/JokeRepository';
import { SharingService } from '../services/SharingService';
import JokeCard from '../components/JokeCard';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type FavoritesScreenProps = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

interface FavoriteJoke extends Joke {
  id: string;
  favorited_at?: string;
}

interface FilterState {
  language: string;
  topic: string;
  style: string;
  searchQuery: string;
}

const ITEMS_PER_PAGE = 20;

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({ navigation }) => {
  const [favorites, setFavorites] = useState<FavoriteJoke[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    language: 'all',
    topic: 'all',
    style: 'all',
    searchQuery: '',
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  const currentPage = useRef(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const flatListRef = useRef<FlatList>(null);
  const searchInputRef = useRef<TextInput>(null);

  const favoritesRepo = new FavoritesRepository();
  const jokeRepo = new JokeRepository();

  // Load favorites data
  const loadFavorites = useCallback(async (page: number = 0, reset: boolean = false) => {
    try {
      if (page === 0) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Mock user ID - in real app this would come from auth
      const userId = 'current_user';
      
      // Get favorite jokes
      const favoriteJokes = await favoritesRepo.findJokesByUser(userId, {
        offset: page * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
      });

      // Apply filters
      let filteredJokes = favoriteJokes.filter(joke => {
        // Language filter
        if (filters.language !== 'all' && joke.lang !== filters.language) {
          return false;
        }
        
        // Topic filter
        if (filters.topic !== 'all' && joke.topic !== filters.topic) {
          return false;
        }
        
        // Style filter  
        if (filters.style !== 'all' && joke.style !== filters.style) {
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

      // Convert to FavoriteJoke format
      const favoriteItems: FavoriteJoke[] = filteredJokes.map(joke => ({
        ...joke,
        id: joke.id?.toString() || '',
      }));

      if (reset || page === 0) {
        setFavorites(favoriteItems);
        currentPage.current = 0;
      } else {
        setFavorites(prev => [...prev, ...favoriteItems]);
      }

      setHasMore(favoriteItems.length === ITEMS_PER_PAGE);
      currentPage.current = page;

    } catch (error) {
      console.error('Error loading favorites:', error);
      Alert.alert(
        'Error',
        'Failed to load favorite jokes. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [filters, favoritesRepo]);

  // Initial load
  useEffect(() => {
    loadFavorites(0, true);
  }, [loadFavorites]);

  // Search debouncing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      loadFavorites(0, true);
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
    loadFavorites(0, true);
  }, [loadFavorites]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadFavorites(currentPage.current + 1, false);
    }
  }, [loadFavorites, loadingMore, hasMore]);

  // Remove from favorites handler
  const handleFavoriteToggle = useCallback(async (jokeId: string, isFavorite: boolean) => {
    try {
      const userId = 'current_user';
      const jokeIdNum = parseInt(jokeId);
      
      if (isNaN(jokeIdNum)) return;

      // Remove from favorites
      const removed = await favoritesRepo.remove(userId, jokeIdNum);
      
      if (removed) {
        // Remove from local state
        setFavorites(prev => prev.filter(fav => fav.id !== jokeId));
        
        // Clear selection if item was selected
        if (selectedItems.has(jokeId)) {
          setSelectedItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(jokeId);
            return newSet;
          });
        }

        // Announce to screen reader
        AccessibilityInfo.announceForAccessibility('Removed from favorites');
      }

    } catch (error) {
      console.error('Error removing from favorites:', error);
      Alert.alert('Error', 'Failed to remove from favorites. Please try again.');
    }
  }, [favoritesRepo, selectedItems]);

  // Share handler
  const handleShare = useCallback(async (jokeId: string) => {
    const joke = favorites.find(fav => fav.id === jokeId);
    if (joke) {
      await SharingService.shareJokeOptimized(joke, {
        includeMetadata: true,
        includeAppName: true,
      });
    }
  }, [favorites]);

  // Selection handlers
  const toggleSelection = useCallback((jokeId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jokeId)) {
        newSet.delete(jokeId);
      } else {
        newSet.add(jokeId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode(prev => !prev);
    if (isSelectionMode) {
      setSelectedItems(new Set());
    }
  }, [isSelectionMode]);

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(favorites.map(fav => fav.id)));
  }, [favorites]);

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set());
  }, []);

  // Bulk actions
  const shareSelected = useCallback(async () => {
    const selectedJokes = favorites.filter(fav => selectedItems.has(fav.id));
    if (selectedJokes.length > 0) {
      await SharingService.shareMultipleJokes(selectedJokes, {
        includeMetadata: true,
        includeAppName: true,
      });
    }
  }, [favorites, selectedItems]);

  const removeSelected = useCallback(async () => {
    if (selectedItems.size === 0) return;

    Alert.alert(
      'Remove Favorites',
      `Remove ${selectedItems.size} joke${selectedItems.size > 1 ? 's' : ''} from favorites?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const userId = 'current_user';
              
              // Remove all selected items
              for (const jokeId of selectedItems) {
                const jokeIdNum = parseInt(jokeId);
                if (!isNaN(jokeIdNum)) {
                  await favoritesRepo.remove(userId, jokeIdNum);
                }
              }

              // Update local state
              setFavorites(prev => prev.filter(fav => !selectedItems.has(fav.id)));
              setSelectedItems(new Set());
              setIsSelectionMode(false);

              AccessibilityInfo.announceForAccessibility(`Removed ${selectedItems.size} jokes from favorites`);
            } catch (error) {
              console.error('Error removing selected favorites:', error);
              Alert.alert('Error', 'Failed to remove some favorites. Please try again.');
            }
          }
        }
      ]
    );
  }, [selectedItems, favoritesRepo]);

  // Filter handlers
  const handleLanguageFilter = useCallback((language: string) => {
    setFilters(prev => ({ ...prev, language }));
  }, []);

  const handleTopicFilter = useCallback((topic: string) => {
    setFilters(prev => ({ ...prev, topic }));
  }, []);

  const handleStyleFilter = useCallback((style: string) => {
    setFilters(prev => ({ ...prev, style }));
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setFilters(prev => ({ ...prev, searchQuery: text }));
  }, []);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({
      language: 'all',
      topic: 'all',
      style: 'all',
      searchQuery: '',
    });
    if (searchInputRef.current) {
      searchInputRef.current.clear();
    }
  }, []);

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>⭐</Text>
      <Text style={styles.emptyTitle}>No favorite jokes</Text>
      <Text style={styles.emptyDescription}>
        {filters.searchQuery || filters.language !== 'all' || filters.topic !== 'all' || filters.style !== 'all'
          ? 'No jokes match your current filters. Try adjusting your search.'
          : 'Start favoriting jokes to see them here!'}
      </Text>
      {(filters.searchQuery || filters.language !== 'all' || filters.topic !== 'all' || filters.style !== 'all') && (
        <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
          <Text style={styles.clearFiltersText}>Clear Filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Render joke item
  const renderJokeItem = ({ item, index }: { item: FavoriteJoke; index: number }) => (
    <TouchableOpacity
      style={[
        styles.jokeItemContainer,
        isSelectionMode && styles.jokeItemSelectable,
        selectedItems.has(item.id) && styles.jokeItemSelected
      ]}
      onPress={() => isSelectionMode ? toggleSelection(item.id) : undefined}
      onLongPress={() => {
        if (!isSelectionMode) {
          setIsSelectionMode(true);
          toggleSelection(item.id);
        }
      }}
      disabled={!isSelectionMode}
    >
      {isSelectionMode && (
        <View style={styles.selectionIndicator}>
          <View style={[
            styles.selectionCheckbox,
            selectedItems.has(item.id) && styles.selectionCheckboxSelected
          ]}>
            {selectedItems.has(item.id) && (
              <Text style={styles.selectionCheckmark}>✓</Text>
            )}
          </View>
        </View>
      )}
      
      <JokeCard
        joke={item}
        onSwipeLeft={() => {}} // Favorites don't need swipe actions
        onSwipeRight={() => {}}
        isActive={false} // Disable swiping in favorites
        isFavorite={true} // Always favorited in this screen
        onFavoriteToggle={handleFavoriteToggle}
        onShare={handleShare}
        showFavoriteButton={true}
        showShareButton={true}
        reducedMotion={true} // Disable animations for performance
      />
    </TouchableOpacity>
  );

  // Render filter bar
  const renderFilterBar = () => (
    <View style={styles.filterContainer}>
      <View style={styles.filterRow}>
        {/* Language filter */}
        <TouchableOpacity
          style={[styles.filterButton, filters.language !== 'all' && styles.filterButtonActive]}
          onPress={() => {
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

        {/* Topic filter */}
        <TouchableOpacity
          style={[styles.filterButton, filters.topic !== 'all' && styles.filterButtonActive]}
          onPress={() => {
            // Cycle through common topics
            const topics = ['all', 'general', 'animals', 'food', 'technology', 'work'];
            const currentIndex = topics.indexOf(filters.topic);
            const nextIndex = (currentIndex + 1) % topics.length;
            handleTopicFilter(topics[nextIndex]);
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Topic filter: ${filters.topic}`}
        >
          <Text style={[styles.filterButtonText, filters.topic !== 'all' && styles.filterButtonTextActive]}>
            {filters.topic === 'all' ? 'All Topics' : filters.topic}
          </Text>
        </TouchableOpacity>

        {/* Style filter */}
        <TouchableOpacity
          style={[styles.filterButton, filters.style !== 'all' && styles.filterButtonActive]}
          onPress={() => {
            // Cycle through common styles
            const styles = ['all', 'general', 'dad', 'pun', 'observational', 'oneliners'];
            const currentIndex = styles.indexOf(filters.style);
            const nextIndex = (currentIndex + 1) % styles.length;
            handleStyleFilter(styles[nextIndex]);
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`Style filter: ${filters.style}`}
        >
          <Text style={[styles.filterButtonText, filters.style !== 'all' && styles.filterButtonTextActive]}>
            {filters.style === 'all' ? 'All Styles' : filters.style}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Render selection toolbar
  const renderSelectionToolbar = () => {
    if (!isSelectionMode) return null;

    return (
      <View style={styles.selectionToolbar}>
        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={clearSelection}
          disabled={selectedItems.size === 0}
        >
          <Text style={[styles.toolbarButtonText, selectedItems.size === 0 && styles.toolbarButtonTextDisabled]}>
            Clear
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={selectAll}
          disabled={selectedItems.size === favorites.length}
        >
          <Text style={[styles.toolbarButtonText, selectedItems.size === favorites.length && styles.toolbarButtonTextDisabled]}>
            Select All
          </Text>
        </TouchableOpacity>

        <Text style={styles.selectionCount}>
          {selectedItems.size} selected
        </Text>

        <TouchableOpacity
          style={styles.toolbarButton}
          onPress={shareSelected}
          disabled={selectedItems.size === 0}
        >
          <Text style={[styles.toolbarButtonText, selectedItems.size === 0 && styles.toolbarButtonTextDisabled]}>
            Share
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolbarButton, styles.removeButton]}
          onPress={removeSelected}
          disabled={selectedItems.size === 0}
        >
          <Text style={[styles.toolbarButtonText, styles.removeButtonText, selectedItems.size === 0 && styles.toolbarButtonTextDisabled]}>
            Remove
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <LinearGradient colors={['#667eea', '#764ba2']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isSelectionMode) {
              toggleSelectionMode();
            } else {
              navigation.goBack();
            }
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isSelectionMode ? "Cancel selection" : "Go back"}
        >
          <Text style={styles.backButtonText}>
            {isSelectionMode ? '✕' : '←'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isSelectionMode ? 'Select Favorites' : 'Favorite Jokes'}
        </Text>
        <TouchableOpacity
          style={styles.selectButton}
          onPress={toggleSelectionMode}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isSelectionMode ? "Exit selection mode" : "Enter selection mode"}
        >
          <Text style={styles.selectButtonText}>
            {isSelectionMode ? 'Done' : 'Select'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <TextInput
          ref={searchInputRef}
          style={styles.searchInput}
          placeholder="Search favorites..."
          placeholderTextColor="rgba(255, 255, 255, 0.7)"
          value={filters.searchQuery}
          onChangeText={handleSearchChange}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          accessible={true}
          accessibilityLabel="Search favorite jokes"
          accessibilityHint="Enter text to search through your favorite jokes"
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

      {/* Selection toolbar */}
      {renderSelectionToolbar()}

      {/* Favorites list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading favorites...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={favorites}
          renderItem={renderJokeItem}
          keyExtractor={(item) => item.id}
          style={styles.favoritesList}
          contentContainerStyle={[
            styles.favoritesListContent,
            favorites.length === 0 && styles.favoritesListContentEmpty
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
          accessibilityLabel="Favorite jokes list"
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
  selectButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  selectButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    flexWrap: 'wrap',
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
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    gap: 15,
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  toolbarButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  removeButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
  },
  removeButtonText: {
    color: '#fff',
  },
  selectionCount: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  favoritesList: {
    flex: 1,
  },
  favoritesListContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  favoritesListContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  jokeItemContainer: {
    marginBottom: 20,
    position: 'relative',
  },
  jokeItemSelectable: {
    opacity: 0.8,
  },
  jokeItemSelected: {
    opacity: 1,
    transform: [{ scale: 0.98 }],
  },
  selectionIndicator: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
  },
  selectionCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionCheckboxSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  selectionCheckmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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

export default FavoritesScreen;