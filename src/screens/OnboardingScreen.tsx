import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import * as Localization from 'expo-localization';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTranslation } from '../hooks/useTranslation';
import { usePreferences } from '../hooks/usePreferences';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ONBOARDING_KEY = '@giggleglide_onboarding_completed';

const JOKE_CATEGORIES = [
  { id: 'dad-jokes', icon: '👨', key: 'dadJokes' },
  { id: 'puns', icon: '🔤', key: 'puns' },
  { id: 'knock-knock', icon: '🚪', key: 'knockKnock' },
  { id: 'one-liners', icon: '💬', key: 'oneLiners' },
  { id: 'observational', icon: '👀', key: 'observational' },
  { id: 'tech', icon: '💻', key: 'tech' },
  { id: 'animals', icon: '🐾', key: 'animals' },
  { id: 'food', icon: '🍔', key: 'food' },
];

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
];

const TOTAL_PAGES = 4;

interface OnboardingScreenProps {
  onComplete?: () => void;
}

const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onComplete }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { t, changeLanguage, currentLanguage } = useTranslation();
  const { preferences, updatePreferences } = usePreferences();
  
  const pagerRef = useRef<PagerView>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState(currentLanguage);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoDetectedLanguage, setAutoDetectedLanguage] = useState<string | null>(null);
  
  const progress = useSharedValue(0);

  const handlePageChange = (position: number) => {
    setCurrentPage(position);
    progress.value = withSpring(position);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleNext = () => {
    if (currentPage < TOTAL_PAGES - 1) {
      pagerRef.current?.setPage(currentPage + 1);
    }
  };

  const handleSkip = async () => {
    await completeOnboarding();
  };

  const handleLanguageSelect = (languageCode: string) => {
    setSelectedLanguage(languageCode);
    changeLanguage(languageCode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const requestNotificationPermission = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus === 'granted') {
        setNotificationsEnabled(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert(
          t('onboarding.notifications.disabled'),
          t('onboarding.notifications.disabledMessage'),
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    }
  };

  const completeOnboarding = async () => {
    setIsLoading(true);
    
    try {
      // Save preferences
      await updatePreferences({
        language: selectedLanguage,
        favoriteCategories: selectedCategories,
        notificationsEnabled,
      });
      
      // Mark onboarding as completed
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      
      // Navigate to home or call onComplete callback
      if (onComplete) {
        onComplete();
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        });
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Alert.alert(t('errors.general'), t('onboarding.errors.savePreferences'));
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-detect device language and check onboarding status
  useEffect(() => {
    const initializeOnboarding = async () => {
      try {
        // Auto-detect language
        const deviceLanguage = Localization.locale.split('-')[0];
        const supportedLanguage = LANGUAGES.find(lang => lang.code === deviceLanguage);
        if (supportedLanguage) {
          setAutoDetectedLanguage(deviceLanguage);
          setSelectedLanguage(deviceLanguage);
          changeLanguage(deviceLanguage);
        }

        // Check if onboarding is already completed
        const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
        if (completed === 'true' && !onComplete) {
          navigation.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          });
        }
      } catch (error) {
        console.error('Error initializing onboarding:', error);
      }
    };
    
    initializeOnboarding();
  }, [navigation, onComplete, changeLanguage]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${((progress.value + 1) / TOTAL_PAGES) * 100}%`,
  }));

  const renderWelcomePage = () => (
    <View style={styles.page}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.pageGradient}
      >
        <View style={styles.content}>
          <Text style={styles.emoji}>😂</Text>
          <Text style={styles.title}>{t('onboarding.welcome.title')}</Text>
          <Text style={styles.subtitle}>
            {t('onboarding.welcome.subtitle')}
          </Text>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
            <Text style={styles.nextButtonText}>{t('onboarding.welcome.getStarted')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  const renderLanguagePage = () => (
    <View style={styles.page}>
      <LinearGradient
        colors={['#764ba2', '#667eea']}
        style={styles.pageGradient}
      >
        <View style={styles.content}>
          <Text style={styles.emoji}>🌍</Text>
          <Text style={styles.title}>{t('onboarding.language.title')}</Text>
          <Text style={styles.subtitle}>
            {t('onboarding.language.subtitle')}
          </Text>
          {autoDetectedLanguage && (
            <Text style={styles.autoDetectedText}>
              {t('onboarding.language.detected')}: {LANGUAGES.find(l => l.code === autoDetectedLanguage)?.name}
            </Text>
          )}
          
          <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageItem,
                  selectedLanguage === lang.code && styles.selectedLanguageItem,
                ]}
                onPress={() => handleLanguageSelect(lang.code)}
              >
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <View style={styles.languageInfo}>
                  <Text style={[
                    styles.languageName,
                    selectedLanguage === lang.code && styles.selectedLanguageName,
                  ]}>
                    {lang.name}
                  </Text>
                  {autoDetectedLanguage === lang.code && (
                    <Text style={styles.autoDetectedLabel}>{t('onboarding.language.detected')}</Text>
                  )}
                </View>
                {selectedLanguage === lang.code && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>{t('onboarding.navigation.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.nextButton, !selectedLanguage && styles.disabledButton]} 
            onPress={handleNext}
            disabled={!selectedLanguage}
          >
            <Text style={styles.nextButtonText}>{t('onboarding.navigation.next')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  const renderCategoriesPage = () => (
    <View style={styles.page}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.pageGradient}
      >
        <View style={styles.content}>
          <Text style={styles.emoji}>🎭</Text>
          <Text style={styles.title}>{t('onboarding.categories.title')}</Text>
          <Text style={styles.subtitle}>
            {t('onboarding.categories.subtitle')}
          </Text>
          
          <View style={styles.categoriesGrid}>
            {JOKE_CATEGORIES.map(category => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryItem,
                  selectedCategories.includes(category.id) && styles.selectedCategoryItem,
                ]}
                onPress={() => toggleCategory(category.id)}
              >
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={[
                  styles.categoryText,
                  selectedCategories.includes(category.id) && styles.selectedCategoryText,
                ]}>
                  {t(`onboarding.categories.${category.key}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>{t('onboarding.navigation.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.nextButton, selectedCategories.length === 0 && styles.disabledButton]} 
            onPress={handleNext}
            disabled={selectedCategories.length === 0}
          >
            <Text style={styles.nextButtonText}>{t('onboarding.navigation.next')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  const renderNotificationsPage = () => (
    <View style={styles.page}>
      <LinearGradient
        colors={['#764ba2', '#667eea']}
        style={styles.pageGradient}
      >
        <View style={styles.content}>
          <Text style={styles.emoji}>🔔</Text>
          <Text style={styles.title}>{t('onboarding.notifications.title')}</Text>
          <Text style={styles.subtitle}>
            {t('onboarding.notifications.subtitle')}
          </Text>
          
          <TouchableOpacity
            style={[
              styles.notificationButton,
              notificationsEnabled && styles.notificationButtonEnabled,
            ]}
            onPress={requestNotificationPermission}
            disabled={notificationsEnabled}
          >
            <Text style={[
              styles.notificationButtonText,
              notificationsEnabled && styles.notificationButtonTextEnabled,
            ]}>
              {notificationsEnabled ? t('onboarding.notifications.enabled') : t('onboarding.notifications.enable')}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.notificationHint}>
            {t('onboarding.notifications.hint')}
          </Text>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>{t('onboarding.navigation.skip')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.nextButton} 
            onPress={completeOnboarding}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" testID="loading-indicator" />
            ) : (
              <Text style={styles.nextButtonText}>{t('onboarding.final.startLaughing')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Progress Bar */}
      <View style={styles.progressContainer} testID="progress-container">
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, progressBarStyle]} />
        </View>
      </View>
      
      {/* Pages */}
      <PagerView
        ref={pagerRef}
        style={styles.pagerView}
        initialPage={0}
        onPageSelected={(e) => handlePageChange(e.nativeEvent.position)}
      >
        {renderWelcomePage()}
        {renderLanguagePage()}
        {renderCategoriesPage()}
        {renderNotificationsPage()}
      </PagerView>
      
      {/* Page Indicators */}
      <View style={styles.indicators}>
        {Array.from({ length: TOTAL_PAGES }, (_, index) => (
          <View
            key={index}
            style={[
              styles.indicator,
              currentPage === index && styles.activeIndicator,
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  progressContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  pagerView: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  pageGradient: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 40,
  },
  emoji: {
    fontSize: 80,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 26,
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 40,
    gap: 16,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
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
  nextButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  languageList: {
    flex: 1,
    marginTop: 30,
    width: '100%',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedLanguageItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderColor: '#fff',
  },
  languageFlag: {
    fontSize: 32,
    marginRight: 16,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  selectedLanguageName: {
    color: '#fff',
    fontWeight: '600',
  },
  autoDetectedText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  autoDetectedLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
    marginTop: 2,
  },
  checkmark: {
    fontSize: 24,
    color: '#fff',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 30,
    gap: 12,
    justifyContent: 'center',
  },
  categoryItem: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    minWidth: 140,
    margin: 6,
  },
  selectedCategoryItem: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  categoryIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontWeight: '500',
  },
  selectedCategoryText: {
    color: '#667eea',
    fontWeight: '600',
  },
  notificationButton: {
    marginTop: 40,
    paddingVertical: 20,
    paddingHorizontal: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
  },
  notificationButtonEnabled: {
    backgroundColor: '#fff',
  },
  notificationButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  notificationButtonTextEnabled: {
    color: '#667eea',
  },
  notificationHint: {
    marginTop: 20,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  indicators: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  activeIndicator: {
    backgroundColor: '#fff',
    width: 20,
  },
});

// Export a function to check if onboarding is completed
export const isOnboardingCompleted = async (): Promise<boolean> => {
  try {
    const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
    return completed === 'true';
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return false;
  }
};

// Export a function to reset onboarding (useful for testing)
export const resetOnboarding = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch (error) {
    console.error('Error resetting onboarding:', error);
  }
};

export default OnboardingScreen;