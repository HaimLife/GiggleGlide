import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Alert, Platform } from 'react-native';
import { Joke } from './database/types';
import { JokeFormatter } from '../utils/jokeFormatting';

export interface ShareOptions {
  includeMetadata?: boolean;
  includeAppName?: boolean;
  customMessage?: string;
}

export class SharingService {
  private static readonly APP_NAME = 'GiggleGlide';
  private static readonly APP_URL = 'https://giggleglide.app'; // Replace with actual app URL

  /**
   * Share a joke using the native sharing interface
   */
  static async shareJoke(joke: Joke, options: ShareOptions = {}): Promise<boolean> {
    try {
      const {
        includeMetadata = true,
        includeAppName = true,
        customMessage = ''
      } = options;

      let shareText = customMessage || this.formatJokeForSharing(joke, includeMetadata);
      
      if (includeAppName) {
        shareText += `\n\nShared from ${this.APP_NAME} ${this.APP_URL}`;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(shareText, {
          dialogTitle: 'Share this joke',
          mimeType: 'text/plain',
        });
        return true;
      } else {
        // Fallback to clipboard
        await this.copyToClipboard(shareText);
        Alert.alert(
          'Sharing not available',
          'The joke has been copied to your clipboard instead.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Error sharing joke:', error);
      Alert.alert(
        'Error',
        'Unable to share joke. Please try again.',
        [{ text: 'OK' }]
      );
      return false;
    }
  }

  /**
   * Copy joke to clipboard
   */
  static async copyToClipboard(text: string): Promise<boolean> {
    try {
      await Clipboard.setStringAsync(text);
      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  }

  /**
   * Copy joke to clipboard with user feedback
   */
  static async copyJokeToClipboard(joke: Joke, options: ShareOptions = {}): Promise<boolean> {
    try {
      const {
        includeMetadata = true,
        includeAppName = true,
        customMessage = ''
      } = options;

      let shareText = customMessage || this.formatJokeForSharing(joke, includeMetadata);
      
      if (includeAppName) {
        shareText += `\n\nFrom ${this.APP_NAME}`;
      }

      const success = await this.copyToClipboard(shareText);
      
      if (success) {
        Alert.alert(
          'Copied!',
          'Joke copied to clipboard',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Error',
          'Unable to copy joke to clipboard',
          [{ text: 'OK' }]
        );
      }
      
      return success;
    } catch (error) {
      console.error('Error copying joke to clipboard:', error);
      return false;
    }
  }

  /**
   * Share multiple jokes
   */
  static async shareMultipleJokes(jokes: Joke[], options: ShareOptions = {}): Promise<boolean> {
    try {
      const {
        includeMetadata = true,
        includeAppName = true,
        customMessage = ''
      } = options;

      let shareText = customMessage || 'Here are some great jokes:';
      
      jokes.forEach((joke, index) => {
        shareText += `\n\n${index + 1}. ${this.formatJokeForSharing(joke, includeMetadata)}`;
      });
      
      if (includeAppName) {
        shareText += `\n\nShared from ${this.APP_NAME} ${this.APP_URL}`;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      
      if (isAvailable) {
        await Sharing.shareAsync(shareText, {
          dialogTitle: `Share ${jokes.length} jokes`,
          mimeType: 'text/plain',
        });
        return true;
      } else {
        await this.copyToClipboard(shareText);
        Alert.alert(
          'Sharing not available',
          'The jokes have been copied to your clipboard instead.',
          [{ text: 'OK' }]
        );
        return false;
      }
    } catch (error) {
      console.error('Error sharing multiple jokes:', error);
      Alert.alert(
        'Error',
        'Unable to share jokes. Please try again.',
        [{ text: 'OK' }]
      );
      return false;
    }
  }

  /**
   * Format joke for sharing with optional metadata
   */
  private static formatJokeForSharing(joke: Joke, includeMetadata: boolean = true): string {
    let formattedJoke = JokeFormatter.formatForContext(joke, 'share');
    
    if (includeMetadata && (joke.topic || joke.style || joke.tone)) {
      const metadata = [];
      if (joke.topic && joke.topic !== 'general') {
        metadata.push(`Topic: ${joke.topic}`);
      }
      if (joke.style && joke.style !== 'general') {
        metadata.push(`Style: ${joke.style}`);
      }
      if (joke.tone) {
        metadata.push(`Tone: ${joke.tone}`);
      }
      
      if (metadata.length > 0) {
        formattedJoke += `\n\n[${metadata.join(' • ')}]`;
      }
    }
    
    return formattedJoke;
  }

  /**
   * Get sharing options for the current platform
   */
  static async getSharingCapabilities(): Promise<{
    canShare: boolean;
    canCopy: boolean;
    availableApps?: string[];
  }> {
    try {
      const canShare = await Sharing.isAvailableAsync();
      const canCopy = true; // Clipboard is always available
      
      return {
        canShare,
        canCopy,
        // Note: Expo doesn't provide a way to get available apps
        // This would need to be implemented with native modules if needed
        availableApps: canShare ? ['system'] : undefined,
      };
    } catch (error) {
      console.error('Error checking sharing capabilities:', error);
      return {
        canShare: false,
        canCopy: true,
      };
    }
  }

  /**
   * Share a joke with platform-specific optimizations
   */
  static async shareJokeOptimized(joke: Joke, options: ShareOptions = {}): Promise<boolean> {
    const capabilities = await this.getSharingCapabilities();
    
    if (capabilities.canShare) {
      return this.shareJoke(joke, options);
    } else if (capabilities.canCopy) {
      return this.copyJokeToClipboard(joke, options);
    } else {
      Alert.alert(
        'Sharing not available',
        'Unable to share or copy on this device.',
        [{ text: 'OK' }]
      );
      return false;
    }
  }

  /**
   * Create a shareable link for a joke (if supported)
   */
  static async createShareableLink(joke: Joke): Promise<string | null> {
    // This would typically involve creating a deep link or web link
    // For now, we'll return a basic formatted text
    try {
      if (joke.id) {
        return `${this.APP_URL}/joke/${joke.id}`;
      }
      return null;
    } catch (error) {
      console.error('Error creating shareable link:', error);
      return null;
    }
  }
}