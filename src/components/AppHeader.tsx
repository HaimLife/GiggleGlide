import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { LanguageChip } from './LanguageChip';
import { LanguageSelector } from './LanguageSelector';

interface AppHeaderProps {
  title?: string;
  showLanguageChip?: boolean;
  backgroundColor?: string;
  textColor?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  showLanguageChip = true,
  backgroundColor = '#667eea',
  textColor = '#fff',
}) => {
  const { t } = useTranslation();
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);
  const languageChangeAnim = useRef(new Animated.Value(0)).current;

  const handleLanguagePress = () => {
    setShowLanguageSelector(true);
  };

  const handleLanguageChanged = (language: string) => {
    // Trigger animation feedback
    Animated.sequence([
      Animated.timing(languageChangeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(languageChangeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCloseLanguageSelector = () => {
    setShowLanguageSelector(false);
  };

  return (
    <>
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <View style={[styles.header, { backgroundColor }]}>
          <View style={styles.titleContainer}>
            {title && (
              <Text style={[styles.title, { color: textColor }]}>{title}</Text>
            )}
          </View>
          
          <View style={styles.rightContainer}>
            {showLanguageChip && (
              <LanguageChip
                onPress={handleLanguagePress}
                animatedValue={languageChangeAnim}
              />
            )}
          </View>
        </View>
      </SafeAreaView>

      <LanguageSelector
        visible={showLanguageSelector}
        onClose={handleCloseLanguageSelector}
        onLanguageChanged={handleLanguageChanged}
      />
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
    right: 16,
    top: 12,
    bottom: 12,
    justifyContent: 'flex-end',
  },
});