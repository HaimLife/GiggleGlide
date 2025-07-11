import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { AppNavigator } from './navigation/AppNavigator';
import OnboardingScreen, { isOnboardingCompleted } from './screens/OnboardingScreen';
import NavigationService from './services/NavigationService';
import { NotificationService } from './services/NotificationService';
import BackgroundJobService from './services/BackgroundJobService';
import './i18n/index'; // Initialize i18n

// Configure how notifications are handled when the app is running
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Create notification channel for Android
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('giggleglide-daily', {
    name: 'Daily Jokes',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#667eea',
    sound: 'default',
    description: 'Daily joke notifications to brighten your day',
  });
}

export default function App() {
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();
  const linkingListener = useRef<any>();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize services
        const notificationService = NotificationService.getInstance();
        const backgroundJobService = BackgroundJobService.getInstance();
        
        await Promise.all([
          notificationService.initialize(),
          backgroundJobService.initialize(),
        ]);

        // Check onboarding status
        const completed = await isOnboardingCompleted();
        setIsOnboardingComplete(completed);
      } catch (error) {
        console.error('Error initializing app:', error);
        // Default to showing onboarding if there's an error
        setIsOnboardingComplete(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  useEffect(() => {
    const navigationService = NavigationService.getInstance();

    // Listen for incoming notifications while app is running
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listen for user interactions with notifications
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      const data = response.notification.request.content.data;
      
      // Wait for navigation to be ready, then handle the notification
      navigationService.waitForReady().then(() => {
        navigationService.handleNotificationNavigation(data);
      });
    });

    // Listen for deep links
    const handleDeepLink = (url: string) => {
      console.log('Deep link received:', url);
      navigationService.waitForReady().then(() => {
        navigationService.handleDeepLink(url);
      });
    };

    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Listen for subsequent deep links
    linkingListener.current = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
      if (linkingListener.current) {
        linkingListener.current.remove();
      }
    };
  }, []);

  const handleOnboardingComplete = () => {
    setIsOnboardingComplete(true);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#667eea' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {isOnboardingComplete ? (
        <AppNavigator />
      ) : (
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      )}
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}
