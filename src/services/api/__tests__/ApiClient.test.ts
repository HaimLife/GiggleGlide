import { jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ApiClient from '../ApiClient';
import NetworkService from '../NetworkService';
import DeviceService from '../DeviceService';
import { NetworkError, ApiRequestError, AuthenticationError } from '../types';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../NetworkService');
jest.mock('../DeviceService');

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockNetworkService = {
  getInstance: jest.fn(),
  isConnected: jest.fn(),
};
const mockDeviceService = {
  getInstance: jest.fn(),
  getDeviceInfo: jest.fn(),
  getDeviceInfoString: jest.fn(),
};

// Mock fetch globally
global.fetch = jest.fn();

describe('ApiClient', () => {
  let apiClient: ApiClient;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    
    // Setup default mocks
    (NetworkService.getInstance as jest.Mock).mockReturnValue(mockNetworkService);
    (DeviceService.getInstance as jest.Mock).mockReturnValue(mockDeviceService);
    
    mockNetworkService.isConnected.mockReturnValue(true);
    mockDeviceService.getDeviceInfo.mockResolvedValue({
      uuid: 'test-device-uuid',
      model: 'iPhone',
      platform: 'iOS',
      version: '15.0',
      appVersion: '1.0.0'
    });
    mockDeviceService.getDeviceInfoString.mockResolvedValue('iOS 15.0 - iPhone (App: 1.0.0)');
    
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();

    apiClient = ApiClient.getInstance({ baseUrl: 'http://test.com' });
  });

  describe('Authentication', () => {
    it('should register device and store token', async () => {
      const mockTokenResponse = {
        access_token: 'test-token',
        token_type: 'bearer',
        expires_in: 3600
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockTokenResponse))
      } as Response);

      const result = await apiClient.registerDevice();

      expect(result).toEqual(mockTokenResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/auth/register-device',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify({
            device_uuid: 'test-device-uuid',
            device_info: 'iOS 15.0 - iPhone (App: 1.0.0)'
          })
        })
      );
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('api_access_token', 'test-token');
    });

    it('should handle authentication errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' }))
      } as Response);

      await expect(apiClient.registerDevice()).rejects.toThrow(ApiRequestError);
    });

    it('should use stored token for authenticated requests', async () => {
      // Setup stored token
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'api_access_token') return Promise.resolve('stored-token');
        if (key === 'api_token_expires') return Promise.resolve((Date.now() + 3600000).toString());
        return Promise.resolve(null);
      });

      // Recreate client to load stored token
      apiClient = ApiClient.getInstance();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ id: 1, text: 'Test joke' }))
      } as Response);

      await apiClient.getNextJoke();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer stored-token'
          })
        })
      );
    });
  });

  describe('Network Error Handling', () => {
    it('should throw NetworkError when offline', async () => {
      mockNetworkService.isConnected.mockReturnValue(false);

      await expect(apiClient.getNextJoke()).rejects.toThrow(NetworkError);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle fetch errors as NetworkError', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Network request failed'));

      await expect(apiClient.getNextJoke()).rejects.toThrow(NetworkError);
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(() => 
        new Promise((resolve) => {
          // Never resolve to simulate timeout
        })
      );

      // Use a shorter timeout for testing
      const shortTimeoutClient = ApiClient.getInstance({ 
        baseUrl: 'http://test.com',
        timeout: 100 
      });

      await expect(shortTimeoutClient.getNextJoke()).rejects.toThrow();
    });
  });

  describe('API Endpoints', () => {
    beforeEach(() => {
      // Mock successful authentication for all endpoint tests
      mockFetch.mockImplementation((url, options) => {
        if (url.toString().includes('/auth/register-device')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(JSON.stringify({
              access_token: 'test-token',
              token_type: 'bearer',
              expires_in: 3600
            }))
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({}))
        } as Response);
      });
    });

    it('should get next joke', async () => {
      const mockJoke = {
        id: 1,
        text: 'Test joke',
        language: 'en',
        created_at: '2023-01-01T00:00:00Z',
        creator: 'system'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockJoke))
      } as Response);

      const result = await apiClient.getNextJoke({ language: 'en' });

      expect(result).toEqual(mockJoke);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/next-joke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ language: 'en' })
        })
      );
    });

    it('should submit feedback', async () => {
      const mockResponse = {
        success: true,
        message: 'Feedback recorded'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockResponse))
      } as Response);

      const result = await apiClient.submitFeedback({
        joke_id: 1,
        sentiment: 'like'
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/feedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ joke_id: 1, sentiment: 'like' })
        })
      );
    });

    it('should get user history', async () => {
      const mockHistory = {
        jokes: [],
        total: 0,
        limit: 50,
        offset: 0
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockHistory))
      } as Response);

      const result = await apiClient.getHistory({ limit: 10, offset: 5 });

      expect(result).toEqual(mockHistory);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/history?limit=10&offset=5',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should get user stats', async () => {
      const mockStats = {
        total_seen: 10,
        liked: 5,
        disliked: 2,
        neutral: 3,
        favorites: 2
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockStats))
      } as Response);

      const result = await apiClient.getUserStats();

      expect(result).toEqual(mockStats);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/stats',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ message: 'Not found' }))
      } as Response);

      await expect(apiClient.getNextJoke()).rejects.toThrow(ApiRequestError);
    });

    it('should handle 500 errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve(JSON.stringify({ message: 'Server error' }))
      } as Response);

      await expect(apiClient.getNextJoke()).rejects.toThrow(ApiRequestError);
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('invalid json')
      } as Response);

      await expect(apiClient.getNextJoke()).rejects.toThrow();
    });

    it('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const result = await apiClient.getNextJoke();
      expect(result).toEqual({});
    });
  });

  describe('Token Management', () => {
    it('should refresh expired token automatically', async () => {
      // Setup expired token
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'api_access_token') return Promise.resolve('expired-token');
        if (key === 'api_token_expires') return Promise.resolve((Date.now() - 1000).toString()); // Expired
        return Promise.resolve(null);
      });

      const registerResponse = {
        access_token: 'new-token',
        token_type: 'bearer',
        expires_in: 3600
      };

      const jokeResponse = {
        id: 1,
        text: 'Test joke'
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(registerResponse))
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(JSON.stringify(jokeResponse))
        } as Response);

      // Recreate client to load expired token
      apiClient = ApiClient.getInstance();

      const result = await apiClient.getNextJoke();

      expect(result).toEqual(jokeResponse);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Once for registration, once for joke
    });

    it('should clear token on 401 response', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve(JSON.stringify({ message: 'Unauthorized' }))
        } as Response);

      await expect(apiClient.getNextJoke()).rejects.toThrow(AuthenticationError);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('api_access_token');
    });
  });

  describe('Configuration', () => {
    it('should allow configuration updates', () => {
      apiClient.configure({ timeout: 5000, retryAttempts: 5 });
      
      const config = apiClient.getConfig();
      expect(config.timeout).toBe(5000);
      expect(config.retryAttempts).toBe(5);
    });

    it('should test connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('')
      } as Response);

      const result = await apiClient.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/health',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('should return false on connection test failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await apiClient.testConnection();

      expect(result).toBe(false);
    });
  });
});