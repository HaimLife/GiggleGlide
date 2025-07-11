import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';

interface LanguageChipProps {
  onPress: () => void;
  animatedValue?: Animated.Value;
}

const languageFlags: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
};

const languageNames: Record<string, string> = {
  en: 'EN',
  es: 'ES',
};

export const LanguageChip: React.FC<LanguageChipProps> = ({
  onPress,
  animatedValue,
}) => {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language;

  const animatedStyle = animatedValue
    ? {
        transform: [
          {
            scale: animatedValue.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: [1, 1.1, 1],
            }),
          },
        ],
        opacity: animatedValue.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [1, 0.7, 1],
        }),
      }
    : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.container}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      testID="language-chip"
      accessibilityRole="button"
      accessibilityLabel={`Current language: ${languageNames[currentLanguage] || 'EN'}`}
    >
      <Animated.View style={[styles.chip, animatedStyle]}>
        <Text style={styles.flag}>{languageFlags[currentLanguage] || '🌐'}</Text>
        <Text style={styles.code}>{languageNames[currentLanguage] || 'EN'}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  flag: {
    fontSize: 16,
    marginRight: 4,
  },
  code: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
});