import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Alert,
  StatusBar,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { RootStackParamList } from '../navigation/types';
import { AppHeader } from '../components/AppHeader';
import JokeCard from '../components/JokeCard';
import { useEnhancedJokes } from '../hooks/useEnhancedJokes';
import { useNetworkState } from '../hooks/useNetworkState';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { usePreferences } from '../hooks/usePreferences';
import { Joke, Sentiment } from '../services/database/types';
import { DeviceService } from '../services/api';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface EnhancedHomeScreenProps {
  navigation: HomeScreenNavigationProp;
}

export const EnhancedHomeScreen: React.FC<EnhancedHomeScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const [userId, setUserId] = useState<string>('');
  const [currentJokeIndex, setCurrentJokeIndex] = useState(0);
  const [showHints, setShowHints] = useState(false);
  const [jokes, setJokes] = useState<Joke[]>([]);
  
  const networkState = useNetworkState();
  const syncStatus = useSyncStatus();
  const { preferences } = usePreferences();
  
  const {
    currentJoke,
    isLoading,
    error,
    source,
    fromNetwork,
    syncStatus: jokesSyncStatus,
    isOffline,
    loadNextJoke,
    submitFeedback,
    forceSyncNow,
    clearError,
    refresh
  } = useEnhancedJokes({ userId, autoRefresh: true });

  // Initialize user ID from device
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const deviceService = DeviceService.getInstance();
        const deviceInfo = await deviceService.getDeviceInfo();
        setUserId(deviceInfo.uuid);
      } catch (error) {
        console.error('Error initializing user:', error);
        // Fallback to a temporary ID
        setUserId(`temp_${Date.now()}`);
      }
    };

    initializeUser();
  }, []);

  // Load initial joke when user ID is ready
  useEffect(() => {
    if (userId && !currentJoke && !isLoading) {
      loadNextJoke(userId);
    }
  }, [userId, currentJoke, isLoading, loadNextJoke]);

  // Focus effect to refresh when screen becomes active
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        refresh();
      }
    }, [userId, refresh])
  );

  // Show hints for first-time users
  useEffect(() => {
    const shouldShowHints = preferences?.showOnboardingHints !== false;
    setShowHints(shouldShowHints);
  }, [preferences]);

  const handleSwipeLeft = useCallback(async (jokeId: string) => {
    if (!userId) return;
    
    try {
      await submitFeedback(userId, parseInt(jokeId), 'dislike');
      await loadNextJoke(userId);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Error handling dislike:', error);
      Alert.alert('Error', 'Failed to submit feedback. Your response has been saved offline.');
    }
  }, [userId, submitFeedback, loadNextJoke]);

  const handleSwipeRight = useCallback(async (jokeId: string) => {
    if (!userId) return;
    
    try {
      await submitFeedback(userId, parseInt(jokeId), 'like');
      await loadNextJoke(userId);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error('Error handling like:', error);
      Alert.alert('Error', 'Failed to submit feedback. Your response has been saved offline.');
    }
  }, [userId, submitFeedback, loadNextJoke]);

  const handleSwipeUp = useCallback(async (jokeId: string) => {
    if (!userId) return;
    
    try {
      await submitFeedback(userId, parseInt(jokeId), 'neutral');
      await loadNextJoke(userId);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error handling neutral:', error);
      Alert.alert('Error', 'Failed to submit feedback. Your response has been saved offline.');
    }
  }, [userId, submitFeedback, loadNextJoke]);

  const handlePullToRefresh = useCallback(async () => {
    if (!userId) return;
    
    try {
      await loadNextJoke(userId);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error refreshing joke:', error);
    }
  }, [userId, loadNextJoke]);

  const handleForceSyncPress = useCallback(async () => {
    if (isOffline) {
      Alert.alert('Offline', 'Cannot sync while offline. Please check your internet connection.');
      return;
    }

    try {
      await forceSyncNow();
      await syncStatus.forceSyncNow();
      Alert.alert('Success', 'All pending data has been synced!');
    } catch (error) {
      console.error('Error during force sync:', error);
      Alert.alert('Sync Failed', 'Failed to sync all data. Please try again later.');
    }
  }, [isOffline, forceSyncNow, syncStatus]);

  const handleFavoriteToggle = useCallback((jokeId: string, isFavorite: boolean) => {
    // This would integrate with the favorites system
    console.log(`Toggle favorite for joke ${jokeId}:`, isFavorite);
    // TODO: Implement favorites functionality
  }, []);

  const handleShare = useCallback((jokeId: string) => {
    // This would use the sharing service
    console.log(`Share joke ${jokeId}`);
    // The JokeCard component already handles sharing via SharingService
  }, []);

  const renderNetworkStatus = () => {
    if (isOffline) {
      return (
        <View style={styles.networkStatusContainer}>
          <Text style={styles.networkStatusText}>
            📴 Offline Mode - Your responses will sync when connection is restored
          </Text>
        </View>
      );
    }

    if (syncStatus.hasPendingChanges) {
      return (
        <TouchableOpacity 
          style={styles.syncStatusContainer}
          onPress={handleForceSyncPress}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={`${syncStatus.pendingSyncs} items pending sync. Tap to sync now.`}
        >
          <Text style={styles.syncStatusText}>
            ⏳ {syncStatus.pendingSyncs} pending sync • Tap to sync now
          </Text>
        </TouchableOpacity>
      );
    }

    if (fromNetwork) {
      return (
        <View style={styles.networkStatusContainer}>
          <Text style={styles.networkStatusText}>
            🌐 Fresh from server
          </Text>
        </View>
      );
    }

    return null;
  };

  const renderDataSourceBadge = () => {
    if (!source) return null;

    const badgeText = source === 'api' ? '🌐 Live' : 
                     source === 'cache' ? '💾 Cached' : 
                     '📱 Local';
    
    return (
      <View style={styles.sourceBadge}>
        <Text style={styles.sourceBadgeText}>{badgeText}</Text>
      </View>
    );
  };

  const renderErrorState = () => {
    if (!error) return null;

    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>⚠️ {error}</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={() => {
            clearError();
            if (userId) {
              loadNextJoke(userId);
            }
          }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Retry loading joke"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (!userId) {
    return (
      <SafeAreaView style={styles.container}>
        <AppHeader title={t('navigation.home')} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      <AppHeader 
        title={t('navigation.home')} 
        showSettings={true}
        onSettingsPress={() => navigation.navigate('Settings')}
      />

      {renderNetworkStatus()}
      {renderDataSourceBadge()}
      {renderErrorState()}

      <View style={styles.jokeContainer}>
        {currentJoke && (
          <JokeCard
            joke={{
              ...currentJoke,
              id: currentJoke.id?.toString() || '0'
            }}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            onSwipeUp={handleSwipeUp}
            onPullToRefresh={handlePullToRefresh}
            onFavoriteToggle={handleFavoriteToggle}
            onShare={handleShare}
            isActive={true}
            isLoading={isLoading}
            error={error}
            showHints={showHints}
            reducedMotion={preferences?.reducedMotion || false}
            isFavorite={false} // TODO: Implement favorites check
            showFavoriteButton={true}
            showShareButton={true}
          />
        )}
        
        {!currentJoke && !isLoading && !error && (
          <View style={styles.noJokesContainer}>
            <Text style={styles.noJokesText}>🎭</Text>
            <Text style={styles.noJokesTitle}>No jokes available</Text>
            <Text style={styles.noJokesSubtitle}>
              {isOffline ? 
                'You\'re offline. Connect to internet to load jokes.' :
                'Pull down to refresh or check your connection.'
              }
            </Text>
            <TouchableOpacity 
              style={styles.refreshButton}
              onPress={handlePullToRefresh}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Refresh to load jokes"
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Debug info for development */}
      {__DEV__ && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>
            User: {userId.substring(0, 8)}... | Source: {source} | 
            Sync: {syncStatus.pendingSyncs} pending | 
            Online: {networkState.isConnected ? 'Yes' : 'No'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#667eea',
    fontWeight: '500',
  },
  jokeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  networkStatusContainer: {
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 152, 0, 0.3)',
  },
  networkStatusText: {
    fontSize: 12,
    color: '#F57C00',
    textAlign: 'center',
    fontWeight: '500',
  },
  syncStatusContainer: {
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.3)',
  },
  syncStatusText: {
    fontSize: 12,
    color: '#1976D2',
    textAlign: 'center',
    fontWeight: '500',
  },
  sourceBadge: {
    position: 'absolute',
    top: 100,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 10,
  },
  sourceBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(244, 67, 54, 0.3)',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  noJokesContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noJokesText: {
    fontSize: 64,
    marginBottom: 16,
  },
  noJokesTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  noJokesSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  refreshButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  debugContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  debugText: {
    color: '#fff',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

export default EnhancedHomeScreen;