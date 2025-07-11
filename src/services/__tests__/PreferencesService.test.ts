import { PreferencesService } from '../PreferencesService';
import { UserPreferencesRepository } from '../database/repositories/UserPreferencesRepository';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock dependencies
jest.mock('../database/repositories/UserPreferencesRepository');
jest.mock('@react-native-async-storage/async-storage');

describe('PreferencesService', () => {
  let service: PreferencesService;
  let mockRepository: jest.Mocked<UserPreferencesRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (PreferencesService as any).instance = null;
    
    // Setup mocks
    mockRepository = new UserPreferencesRepository() as jest.Mocked<UserPreferencesRepository>;
    (UserPreferencesRepository as jest.Mock).mockImplementation(() => mockRepository);
    
    // Mock AsyncStorage
    (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([]);
    (AsyncStorage.multiSet as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.multiRemove as jest.Mock).mockResolvedValue(undefined);
    
    service = PreferencesService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = PreferencesService.getInstance();
      const instance2 = PreferencesService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should initialize with database preferences', async () => {
      const dbPrefs = {
        id: 1,
        locale: 'es',
        push_token: 'test-token',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };

      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      
      (AsyncStorage.multiGet as jest.Mock).mockResolvedValue([
        ['@preferences:darkMode', 'true'],
        ['@preferences:notificationsEnabled', 'false'],
        ['@preferences:notificationTime', '18:00'],
        ['@preferences:soundEnabled', 'true'],
        ['@preferences:hapticFeedbackEnabled', 'false'],
        ['@preferences:autoPlayEnabled', 'true'],
        ['@preferences:jokeCategories', '["Programming", "Dad Jokes"]'],
      ]);

      const prefs = await service.initialize();

      expect(prefs).toEqual({
        id: 1,
        locale: 'es',
        pushToken: 'test-token',
        darkMode: true,
        notificationsEnabled: false,
        notificationTime: '18:00',
        soundEnabled: true,
        hapticFeedbackEnabled: false,
        autoPlayEnabled: true,
        jokeCategories: ['Programming', 'Dad Jokes'],
      });
    });

    it('should handle initialization errors gracefully', async () => {
      mockRepository.getOrCreate.mockRejectedValue(new Error('DB Error'));

      const prefs = await service.initialize();

      expect(prefs).toEqual({
        locale: 'en',
        pushToken: null,
        darkMode: false,
        notificationsEnabled: true,
        notificationTime: '09:00',
        soundEnabled: true,
        hapticFeedbackEnabled: true,
        autoPlayEnabled: false,
        jokeCategories: [],
      });
    });
  });

  describe('updatePreferences', () => {
    beforeEach(async () => {
      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();
    });

    it('should update preferences in both SQLite and AsyncStorage', async () => {
      mockRepository.update.mockResolvedValue(true);

      const updated = await service.updatePreferences({
        locale: 'fr',
        darkMode: true,
        notificationTime: '20:00',
      });

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        locale: 'fr',
        push_token: undefined,
      });

      expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
        expect.arrayContaining([
          ['@preferences:darkMode', 'true'],
          ['@preferences:notificationTime', '20:00'],
        ])
      );

      expect(updated.locale).toBe('fr');
      expect(updated.darkMode).toBe(true);
      expect(updated.notificationTime).toBe('20:00');
    });

    it('should notify listeners on update', async () => {
      const listener = jest.fn();
      service.subscribe(listener);

      await service.updatePreferences({ darkMode: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ darkMode: true })
      );
    });
  });

  describe('language management', () => {
    beforeEach(async () => {
      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();
    });

    it('should update language', async () => {
      mockRepository.update.mockResolvedValue(true);

      await service.updateLanguage('de');

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        locale: 'de',
        push_token: undefined,
      });
    });
  });

  describe('notification settings', () => {
    beforeEach(async () => {
      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();
    });

    it('should update push token', async () => {
      mockRepository.update.mockResolvedValue(true);

      await service.updatePushToken('new-token');

      expect(mockRepository.update).toHaveBeenCalledWith(1, {
        locale: undefined,
        push_token: 'new-token',
      });
    });

    it('should update notification settings', async () => {
      await service.updateNotificationSettings({
        enabled: false,
        time: '21:30',
      });

      expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
        expect.arrayContaining([
          ['@preferences:notificationsEnabled', 'false'],
          ['@preferences:notificationTime', '21:30'],
        ])
      );
    });
  });

  describe('toggle methods', () => {
    beforeEach(async () => {
      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();
    });

    it('should toggle dark mode', async () => {
      const newValue = await service.toggleDarkMode();
      expect(newValue).toBe(true);

      const newValue2 = await service.toggleDarkMode();
      expect(newValue2).toBe(false);
    });

    it('should toggle sound', async () => {
      const newValue = await service.toggleSound();
      expect(newValue).toBe(false);

      const newValue2 = await service.toggleSound();
      expect(newValue2).toBe(true);
    });

    it('should toggle haptic feedback', async () => {
      const newValue = await service.toggleHapticFeedback();
      expect(newValue).toBe(false);

      const newValue2 = await service.toggleHapticFeedback();
      expect(newValue2).toBe(true);
    });
  });

  describe('joke categories', () => {
    beforeEach(async () => {
      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();
    });

    it('should update joke categories', async () => {
      const categories = ['Programming', 'Science', 'Puns'];
      await service.updateJokeCategories(categories);

      expect(AsyncStorage.multiSet).toHaveBeenCalledWith(
        expect.arrayContaining([
          ['@preferences:jokeCategories', JSON.stringify(categories)],
        ])
      );
    });
  });

  describe('reset', () => {
    it('should reset all preferences', async () => {
      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();

      mockRepository.delete.mockResolvedValue(true);

      await service.reset();

      expect(mockRepository.delete).toHaveBeenCalledWith(1);
      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        '@preferences:darkMode',
        '@preferences:notificationsEnabled',
        '@preferences:notificationTime',
        '@preferences:soundEnabled',
        '@preferences:hapticFeedbackEnabled',
        '@preferences:autoPlayEnabled',
        '@preferences:jokeCategories',
      ]);
    });
  });

  describe('subscription', () => {
    it('should handle multiple subscribers', async () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsubscribe1 = service.subscribe(listener1);
      const unsubscribe2 = service.subscribe(listener2);

      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();

      await service.updatePreferences({ darkMode: true });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();

      unsubscribe1();
      await service.updatePreferences({ darkMode: false });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(2);
    });

    it('should handle listener errors gracefully', async () => {
      const errorListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      service.subscribe(errorListener);
      service.subscribe(normalListener);

      const dbPrefs = {
        id: 1,
        locale: 'en',
        push_token: null,
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      };
      mockRepository.getOrCreate.mockResolvedValue(dbPrefs);
      await service.initialize();

      await service.updatePreferences({ darkMode: true });

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });
});