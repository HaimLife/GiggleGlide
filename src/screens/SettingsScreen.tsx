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
  Modal,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import { getAvailableLanguages } from '../i18n';
import { AppHeader } from '../components/AppHeader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationService } from '../services/NotificationService';

interface SettingsScreenProps {
  navigation?: any; // Use proper navigation type from your navigation setup
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [notificationTime, setNotificationTime] = useState('09:00');
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notificationService] = useState(() => NotificationService.getInstance());

  // Load saved preferences on mount
  useEffect(() => {
    initializeNotificationService();
    loadPreferences();
  }, []);

  const initializeNotificationService = async () => {
    try {
      await notificationService.initialize();
    } catch (error) {
      console.error('Failed to initialize notification service:', error);
    }
  };

  const loadPreferences = async () => {
    try {
      const [savedPreferences, notificationSettings] = await Promise.all([
        AsyncStorage.multiGet(['@GiggleGlide:darkMode']),
        notificationService.getSettings(),
      ]);

      const preferences = Object.fromEntries(savedPreferences);
      
      if (preferences['@GiggleGlide:darkMode'] !== null) {
        setDarkMode(JSON.parse(preferences['@GiggleGlide:darkMode']));
      }
      
      setNotifications(notificationSettings.enabled);
      setNotificationTime(notificationSettings.time);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setIsLoadingPreferences(false);
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
    try {
      if (value) {
        const success = await notificationService.enableNotifications(notificationTime);
        if (!success) {
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
      } else {
        await notificationService.disableNotifications();
      }
      
      setNotifications(value);
    } catch (error) {
      console.error('Failed to toggle notifications:', error);
      Alert.alert(
        t('errors.general'),
        'Failed to update notification settings. Please try again.'
      );
    }
  };

  const handleTimeChange = async (newTime: string) => {
    try {
      setNotificationTime(newTime);
      
      if (notifications) {
        await notificationService.updateSettings({ time: newTime });
      }
    } catch (error) {
      console.error('Failed to update notification time:', error);
      Alert.alert(
        t('errors.general'),
        'Failed to update notification time. Please try again.'
      );
    }
  };

  const handleTestNotification = async () => {
    try {
      const success = await notificationService.testNotification();
      if (success) {
        Alert.alert(
          'Test Notification Sent',
          'Check your notifications to see if it worked!'
        );
      } else {
        Alert.alert(
          'Test Failed',
          'Unable to send test notification. Please check permissions.'
        );
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      Alert.alert(
        'Test Failed',
        'Failed to send test notification.'
      );
    }
  };

  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeString);
      }
    }
    return options;
  };

  if (isLoadingPreferences) {
    return (
      <View style={styles.container}>
        <AppHeader title={t('settings.title')} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader title={t('settings.title')} />
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >

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
                Get a daily joke notification at {notificationTime}
              </Text>
            </View>
            <Switch
              testID="notification-switch"
              value={notifications}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#767577', true: '#667eea' }}
              thumbColor={notifications ? '#764ba2' : '#f4f3f4'}
            />
          </View>
          
          {notifications && (
            <>
              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>Notification Time</Text>
                <TouchableOpacity
                  testID="time-picker-button"
                  style={styles.timeButton}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={styles.timeButtonText}>{notificationTime}</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity
                testID="test-notification-button"
                style={styles.testButton}
                onPress={handleTestNotification}
              >
                <Text style={styles.testButtonText}>Send Test Notification</Text>
              </TouchableOpacity>
            </>
          )}
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
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('settings.version')}</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => Linking.openURL('https://giggleglide.com/privacy')}
          >
            <Text style={styles.linkButtonText}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => Linking.openURL('https://giggleglide.com/terms')}
          >
            <Text style={styles.linkButtonText}>Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.linkButton}
            onPress={() => Linking.openURL('mailto:support@giggleglide.com')}
          >
            <Text style={styles.linkButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>

        {/* App Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Jokes Viewed</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Jokes Liked</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Favorites Saved</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Notification Time</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowTimePicker(false)}
              >
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            
            <Picker
              testID="time-picker"
              selectedValue={notificationTime}
              onValueChange={handleTimeChange}
              style={styles.timePicker}
            >
              {generateTimeOptions().map((time) => (
                <Picker.Item
                  key={time}
                  label={time}
                  value={time}
                />
              ))}
            </Picker>
          </View>
        </View>
      </Modal>
    </View>
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
  timeButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  timeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#667eea',
  },
  testButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.select({ ios: 34, android: 20 }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  modalCloseText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
  timePicker: {
    height: 200,
  },
});

export default SettingsScreen;