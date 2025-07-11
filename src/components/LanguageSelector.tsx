import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { getAvailableLanguages, changeLanguage } from '../i18n';
import { loadLanguageCache, saveLanguageToCache } from '../utils/languageCache';

interface LanguageSelectorProps {
  visible: boolean;
  onClose: () => void;
  onLanguageChanged?: (language: string) => void;
}

interface Language {
  code: string;
  name: string;
  flag: string;
  isFrequent?: boolean;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const languageFlags: Record<string, string> = {
  en: '🇺🇸',
  es: '🇪🇸',
};

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  visible,
  onClose,
  onLanguageChanged,
}) => {
  const { t, i18n } = useTranslation();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [frequentLanguages, setFrequentLanguages] = useState<string[]>([]);
  const [isChanging, setIsChanging] = useState(false);
  const [slideAnim] = useState(new Animated.Value(SCREEN_HEIGHT));
  const [backgroundOpacity] = useState(new Animated.Value(0));

  useEffect(() => {
    const loadLanguages = async () => {
      const availableLanguages = getAvailableLanguages();
      const cachedFrequentLanguages = await loadLanguageCache();
      
      const languageList: Language[] = availableLanguages.map((lang) => ({
        ...lang,
        flag: languageFlags[lang.code] || '🌐',
        isFrequent: cachedFrequentLanguages.includes(lang.code),
      }));

      // Sort by frequent first, then alphabetically
      languageList.sort((a, b) => {
        if (a.isFrequent && !b.isFrequent) return -1;
        if (!a.isFrequent && b.isFrequent) return 1;
        return a.name.localeCompare(b.name);
      });

      setLanguages(languageList);
      setFrequentLanguages(cachedFrequentLanguages);
    };

    loadLanguages();
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(backgroundOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(backgroundOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleLanguageSelect = async (languageCode: string) => {
    if (isChanging || languageCode === i18n.language) {
      onClose();
      return;
    }

    setIsChanging(true);

    try {
      await changeLanguage(languageCode);
      await saveLanguageToCache(languageCode);
      onLanguageChanged?.(languageCode);
      
      // Small delay to show feedback
      setTimeout(() => {
        setIsChanging(false);
        onClose();
      }, 300);
    } catch (error) {
      console.error('Error changing language:', error);
      setIsChanging(false);
    }
  };

  const renderLanguageItem = ({ item }: { item: Language }) => {
    const isSelected = item.code === i18n.language;
    const isProcessing = isChanging && isSelected;

    return (
      <TouchableOpacity
        style={[
          styles.languageItem,
          isSelected && styles.selectedLanguageItem,
          isProcessing && styles.processingLanguageItem,
        ]}
        onPress={() => handleLanguageSelect(item.code)}
        disabled={isChanging}
        activeOpacity={0.7}
        testID={item.code === 'es' ? 'select-spanish' : `select-${item.code}`}
      >
        <View style={styles.languageContent}>
          <View style={styles.languageInfo}>
            <Text style={styles.flag}>{item.flag}</Text>
            <Text style={[styles.languageName, isSelected && styles.selectedLanguageName]}>
              {item.name}
            </Text>
            {item.isFrequent && (
              <View style={styles.frequentBadge}>
                <Text style={styles.frequentText}>⭐</Text>
              </View>
            )}
          </View>
          {isSelected && (
            <Text style={styles.checkmark}>
              {isProcessing ? '⏳' : '✓'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      testID="language-selector-modal"
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.background,
            { opacity: backgroundOpacity },
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={onClose}
            activeOpacity={1}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.modal,
            { transform: [{ translateY: slideAnim }] },
          ]}
          testID="language-selector"
        >
          <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
              <View style={styles.handle} />
              <Text style={styles.title}>{t('settings.selectLanguage')}</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="close-selector"
              >
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={languages}
              renderItem={renderLanguageItem}
              keyExtractor={(item) => item.code}
              style={styles.languageList}
              showsVerticalScrollIndicator={false}
              bounces={false}
            />
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.6,
    minHeight: 200,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  handle: {
    position: 'absolute',
    top: 8,
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  languageList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  languageItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  selectedLanguageItem: {
    backgroundColor: '#f8f9ff',
  },
  processingLanguageItem: {
    backgroundColor: '#e8f0fe',
  },
  languageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  languageInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  flag: {
    fontSize: 24,
    marginRight: 12,
  },
  languageName: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  selectedLanguageName: {
    fontWeight: '600',
    color: '#007AFF',
  },
  frequentBadge: {
    marginLeft: 8,
  },
  frequentText: {
    fontSize: 12,
  },
  checkmark: {
    fontSize: 18,
    color: '#007AFF',
    fontWeight: '600',
  },
});