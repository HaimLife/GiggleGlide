import { SharingService } from '../SharingService';
import { Joke } from '../database/types';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Alert } from 'react-native';

// Mock the expo modules
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

const mockJoke: Joke = {
  id: 1,
  txt: 'Why don\'t scientists trust atoms? Because they make up everything!',
  lang: 'en',
  style: 'pun',
  topic: 'science',
  tone: 'light',
  format: 'qa',
};

describe('SharingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shareJoke', () => {
    it('should share joke when sharing is available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue({ action: 'shared' });

      const result = await SharingService.shareJoke(mockJoke);

      expect(result).toBe(true);
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringContaining(mockJoke.txt),
        {
          dialogTitle: 'Share this joke',
          mimeType: 'text/plain',
        }
      );
    });

    it('should fallback to clipboard when sharing is not available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await SharingService.shareJoke(mockJoke);

      expect(result).toBe(false);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        expect.stringContaining(mockJoke.txt)
      );
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sharing not available',
        'The joke has been copied to your clipboard instead.',
        [{ text: 'OK' }]
      );
    });

    it('should handle errors gracefully', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockRejectedValue(new Error('Test error'));

      const result = await SharingService.shareJoke(mockJoke);

      expect(result).toBe(false);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Unable to share joke. Please try again.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('copyToClipboard', () => {
    it('should copy text to clipboard successfully', async () => {
      (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await SharingService.copyToClipboard('test text');

      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('test text');
    });

    it('should handle clipboard errors', async () => {
      (Clipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error('Clipboard error'));

      const result = await SharingService.copyToClipboard('test text');

      expect(result).toBe(false);
    });
  });

  describe('copyJokeToClipboard', () => {
    it('should copy joke and show success alert', async () => {
      (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await SharingService.copyJokeToClipboard(mockJoke);

      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
        expect.stringContaining(mockJoke.txt)
      );
      expect(Alert.alert).toHaveBeenCalledWith(
        'Copied!',
        'Joke copied to clipboard',
        [{ text: 'OK' }]
      );
    });
  });

  describe('shareMultipleJokes', () => {
    const multipleJokes = [mockJoke, { ...mockJoke, id: 2, txt: 'Another joke!' }];

    it('should share multiple jokes when sharing is available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue({ action: 'shared' });

      const result = await SharingService.shareMultipleJokes(multipleJokes);

      expect(result).toBe(true);
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringContaining('Here are some great jokes:'),
        {
          dialogTitle: `Share ${multipleJokes.length} jokes`,
          mimeType: 'text/plain',
        }
      );
    });

    it('should format multiple jokes correctly', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue({ action: 'shared' });

      await SharingService.shareMultipleJokes(multipleJokes);

      const shareCall = (Sharing.shareAsync as jest.Mock).mock.calls[0][0];
      expect(shareCall).toContain('1. ');
      expect(shareCall).toContain('2. ');
      expect(shareCall).toContain(multipleJokes[0].txt);
      expect(shareCall).toContain(multipleJokes[1].txt);
    });
  });

  describe('getSharingCapabilities', () => {
    it('should return capabilities when sharing is available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

      const capabilities = await SharingService.getSharingCapabilities();

      expect(capabilities).toEqual({
        canShare: true,
        canCopy: true,
        availableApps: ['system'],
      });
    });

    it('should return capabilities when sharing is not available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      const capabilities = await SharingService.getSharingCapabilities();

      expect(capabilities).toEqual({
        canShare: false,
        canCopy: true,
      });
    });

    it('should handle errors gracefully', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockRejectedValue(new Error('Test error'));

      const capabilities = await SharingService.getSharingCapabilities();

      expect(capabilities).toEqual({
        canShare: false,
        canCopy: true,
      });
    });
  });

  describe('shareJokeOptimized', () => {
    it('should use sharing when available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue({ action: 'shared' });

      const result = await SharingService.shareJokeOptimized(mockJoke);

      expect(result).toBe(true);
      expect(Sharing.shareAsync).toHaveBeenCalled();
    });

    it('should fallback to clipboard when sharing is not available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await SharingService.shareJokeOptimized(mockJoke);

      expect(result).toBe(true);
      expect(Clipboard.setStringAsync).toHaveBeenCalled();
    });

    it('should handle complete failure gracefully', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
      (Clipboard.setStringAsync as jest.Mock).mockRejectedValue(new Error('Clipboard error'));

      const result = await SharingService.shareJokeOptimized(mockJoke);

      expect(result).toBe(false);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Sharing not available',
        'Unable to share or copy on this device.',
        [{ text: 'OK' }]
      );
    });
  });

  describe('createShareableLink', () => {
    it('should create link for joke with id', async () => {
      const jokeWithId = { ...mockJoke, id: 123 };

      const link = await SharingService.createShareableLink(jokeWithId);

      expect(link).toBe('https://giggleglide.app/joke/123');
    });

    it('should return null for joke without id', async () => {
      const jokeWithoutId = { ...mockJoke, id: undefined };

      const link = await SharingService.createShareableLink(jokeWithoutId);

      expect(link).toBeNull();
    });
  });

  describe('formatJokeForSharing', () => {
    it('should format joke with metadata', () => {
      // Access private method for testing
      const formatted = (SharingService as any).formatJokeForSharing(mockJoke, true);

      expect(formatted).toContain(mockJoke.txt);
      expect(formatted).toContain('Topic: science');
      expect(formatted).toContain('Style: pun');
      expect(formatted).toContain('Tone: light');
    });

    it('should format joke without metadata', () => {
      const formatted = (SharingService as any).formatJokeForSharing(mockJoke, false);

      expect(formatted).toBe(mockJoke.txt);
      expect(formatted).not.toContain('Topic:');
    });

    it('should skip general topic and style', () => {
      const generalJoke = { ...mockJoke, topic: 'general', style: 'general' };
      const formatted = (SharingService as any).formatJokeForSharing(generalJoke, true);

      expect(formatted).not.toContain('Topic: general');
      expect(formatted).not.toContain('Style: general');
    });
  });
});