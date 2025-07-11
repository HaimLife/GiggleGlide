import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from '../hooks/useTranslation';
import { changeLanguage, getAvailableLanguages } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { version as appVersion } from '../../package.json';

interface SettingsScreenProps {
  navigation?: any; // Use proper navigation type from your navigation setup
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [notificationTime, setNotificationTime] = useState('09:00');
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  const availableLanguages = getAvailableLanguages();

  // Load saved preferences on mount
  useEffect(() => {
    loadPreferences();
    checkNotificationPermissions();
  }, []);

  const loadPreferences = async () => {
    try {
      const savedPreferences = await AsyncStorage.multiGet([
        '@GiggleGlide:darkMode',
        '@GiggleGlide:notifications',
        '@GiggleGlide:notificationTime',
      ]);

      const preferences = Object.fromEntries(savedPreferences);
      
      if (preferences['@GiggleGlide:darkMode'] !== null) {
        setDarkMode(JSON.parse(preferences['@GiggleGlide:darkMode']));
      }
      if (preferences['@GiggleGlide:notifications'] !== null) {
        setNotifications(JSON.parse(preferences['@GiggleGlide:notifications']));
      }
      if (preferences['@GiggleGlide:notificationTime']) {
        setNotificationTime(preferences['@GiggleGlide:notificationTime']);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  const checkNotificationPermissions = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      const savedNotifications = await AsyncStorage.getItem('@GiggleGlide:notifications');
      if (savedNotifications !== null) {
        setNotifications(JSON.parse(savedNotifications));
      }
    }
  };

  const handleLanguageChange = async (language: string) => {
    if (language === selectedLanguage) return;

    setIsChangingLanguage(true);
    try {
      await changeLanguage(language);
      setSelectedLanguage(language);
    } catch (error) {
      console.error('Failed to change language:', error);
      Alert.alert(
        t('errors.general'),
        'Failed to change language. Please try again.'
      );
    } finally {
      setIsChangingLanguage(false);
    }
  };

  const handleClearFavorites = () => {
    Alert.alert(
      t('settings.clearFavorites'),
      t('settings.clearConfirm'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.confirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('@GiggleGlide:favorites');
              Alert.alert('Success', 'Favorites cleared successfully');
            } catch (error) {
              console.error('Failed to clear favorites:', error);
              Alert.alert(t('errors.general'), 'Failed to clear favorites');
            }
          },
        },
      ]
    );
  };

  const handleToggleDarkMode = async (value: boolean) => {
    setDarkMode(value);
    try {
      await AsyncStorage.setItem('@GiggleGlide:darkMode', JSON.stringify(value));
      // TODO: Implement dark mode theme switching with context
    } catch (error) {
      console.error('Failed to save dark mode preference:', error);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    if (value) {
      // Request permission if enabling
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert(
          t('settings.notificationPermissionTitle'),
          t('settings.notificationPermissionMessage'),
          [
            { text: t('settings.cancel'), style: 'cancel' },
            { 
              text: t('settings.openSettings'), 
              onPress: () => Linking.openSettings() 
            },
          ]
        );
        return;
      }
      
      // Schedule daily notification
      await scheduleDailyJokeNotification();
    } else {
      // Cancel all notifications if disabling
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
    
    setNotifications(value);
    await AsyncStorage.setItem('@GiggleGlide:notifications', JSON.stringify(value));
  };

  const scheduleDailyJokeNotification = async () => {
    const [hours, minutes] = notificationTime.split(':').map(Number);
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('notifications.dailyJokeTitle'),
        body: t('notifications.dailyJokeBody'),
        data: { type: 'daily_joke' },
      },
      trigger: {
        hour: hours,
        minute: minutes,
        repeats: true,
      },
    });
  };

  if (isLoadingPreferences) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Language Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>{t('settings.selectLanguage')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedLanguage}
                onValueChange={handleLanguageChange}
                enabled={!isChangingLanguage}
                style={styles.picker}
              >
                {availableLanguages.map((lang) => (
                  <Picker.Item
                    key={lang.code}
                    label={lang.name}
                    value={lang.code}
                  />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        {/* Appearance Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>{t('settings.darkMode')}</Text>
            <Switch
              value={darkMode}
              onValueChange={handleToggleDarkMode}
              trackColor={{ false: '#767577', true: '#667eea' }}
              thumbColor={darkMode ? '#764ba2' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Notification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.notifications')}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingLabel}>{t('settings.dailyJoke')}</Text>
              <Text style={styles.settingDescription}>
                Get a daily joke notification at 9 AM
              </Text>
            </View>
            <Switch
              value={notifications}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#767577', true: '#667eea' }}
              thumbColor={notifications ? '#764ba2' : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.clearData')}</Text>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={handleClearFavorites}
          >
            <Text style={styles.dangerButtonText}>
              {t('settings.clearFavorites')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.about')}</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('settings.version')}</Text>
            <Text style={styles.infoValue}>{appVersion || '1.0.0'}</Text>
          </View>
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => Linking.openURL('https://giggleglide.com/privacy')}
          >
            <Text style={styles.linkButtonText}>{t('settings.privacyPolicy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => Linking.openURL('https://giggleglide.com/terms')}
          >
            <Text style={styles.linkButtonText}>{t('settings.termsOfService')}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => Linking.openURL('mailto:support@giggleglide.com')}
          >
            <Text style={styles.linkButtonText}>{t('settings.contactSupport')}</Text>
          </TouchableOpacity>
        </View>

        {/* App Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.statistics')}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('settings.jokesViewed')}</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('settings.jokesLiked')}</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{t('settings.favoritesSaved')}</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: '#fff',
    marginVertical: 10,
    paddingHorizontal: 20,
    paddingVertical: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 10,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  settingDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  picker: {
    width: 150,
    height: Platform.OS === 'ios' ? 150 : 50,
  },
  dangerButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 16,
    color: '#333',
  },
  infoValue: {
    fontSize: 16,
    color: '#666',
  },
  linkButton: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  linkButtonText: {
    fontSize: 16,
    color: '#667eea',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
});

export default SettingsScreen;