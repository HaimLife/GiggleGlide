import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkService from './NetworkService';
import DeviceService from './DeviceService';
import RetryService from './RetryService';
import {
  ApiConfig,
  ApiJokeRequest,
  ApiJokeResponse,
  ApiFeedbackRequest,
  ApiFeedbackResponse,
  ApiHistoryRequest,
  ApiHistoryResponse,
  ApiUserStatsResponse,
  DeviceRegistration,
  TokenResponse,
  NetworkError,
  ApiRequestError,
  AuthenticationError
} from './types';

class ApiClient {
  private static instance: ApiClient;
  private config: ApiConfig;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private networkService: NetworkService;
  private deviceService: DeviceService;
  
  private readonly ACCESS_TOKEN_KEY = 'api_access_token';
  private readonly TOKEN_EXPIRES_KEY = 'api_token_expires';

  static getInstance(config?: Partial<ApiConfig>): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient(config);
    }
    return ApiClient.instance;
  }

  private constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      baseUrl: 'http://localhost:8000',
      timeout: 15000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config
    };

    this.networkService = NetworkService.getInstance();
    this.deviceService = DeviceService.getInstance();
    
    // Load stored token
    this.loadStoredToken();
  }

  /**
   * Configure API client
   */
  configure(config: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Load stored access token
   */
  private async loadStoredToken(): Promise<void> {
    try {
      const [token, expiresStr] = await Promise.all([
        AsyncStorage.getItem(this.ACCESS_TOKEN_KEY),
        AsyncStorage.getItem(this.TOKEN_EXPIRES_KEY)
      ]);

      if (token && expiresStr) {
        const expires = parseInt(expiresStr, 10);
        if (expires > Date.now()) {
          this.accessToken = token;
          this.tokenExpiresAt = expires;
        } else {
          // Token expired, clear it
          await this.clearStoredToken();
        }
      }
    } catch (error) {
      console.error('Error loading stored token:', error);
    }
  }

  /**
   * Store access token
   */
  private async storeToken(token: string, expiresIn: number): Promise<void> {
    try {
      this.accessToken = token;
      this.tokenExpiresAt = Date.now() + (expiresIn * 1000);

      await Promise.all([
        AsyncStorage.setItem(this.ACCESS_TOKEN_KEY, token),
        AsyncStorage.setItem(this.TOKEN_EXPIRES_KEY, this.tokenExpiresAt.toString())
      ]);
    } catch (error) {
      console.error('Error storing token:', error);
    }
  }

  /**
   * Clear stored token
   */
  private async clearStoredToken(): Promise<void> {
    try {
      this.accessToken = null;
      this.tokenExpiresAt = 0;

      await Promise.all([
        AsyncStorage.removeItem(this.ACCESS_TOKEN_KEY),
        AsyncStorage.removeItem(this.TOKEN_EXPIRES_KEY)
      ]);
    } catch (error) {
      console.error('Error clearing stored token:', error);
    }
  }

  /**
   * Check if token is valid and not expired
   */
  private isTokenValid(): boolean {
    return this.accessToken !== null && Date.now() < this.tokenExpiresAt - 60000; // 1 minute buffer
  }

  /**
   * Ensure device is authenticated
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.isTokenValid()) {
      return;
    }

    // Register or refresh device token
    await this.registerDevice();
  }

  /**
   * Register device and get access token
   */
  async registerDevice(): Promise<TokenResponse> {
    const deviceInfo = await this.deviceService.getDeviceInfo();
    const deviceInfoString = await this.deviceService.getDeviceInfoString();

    const registration: DeviceRegistration = {
      device_uuid: deviceInfo.uuid,
      device_info: deviceInfoString
    };

    const response = await this.makeRequest<TokenResponse>(
      '/auth/register-device',
      {
        method: 'POST',
        body: JSON.stringify(registration),
        skipAuth: true
      }
    );

    await this.storeToken(response.access_token, response.expires_in);
    return response;
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: string;
      headers?: Record<string, string>;
      skipAuth?: boolean;
      skipRetry?: boolean;
    } = {}
  ): Promise<T> {
    // Check network connectivity
    if (!this.networkService.isConnected()) {
      throw new NetworkError('No internet connection', false);
    }

    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add authentication if not skipped
    if (!options.skipAuth) {
      await this.ensureAuthenticated();
      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      }
    }

    const fetchOptions: RequestInit = {
      method: options.method || 'GET',
      headers,
      body: options.body
    };

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), this.config.timeout);
    });

    const makeRequestOnce = async (): Promise<T> => {
      try {
        const response = await Promise.race([
          fetch(url, fetchOptions),
          timeoutPromise
        ]);

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }

          if (response.status === 401) {
            // Clear invalid token and retry once
            await this.clearStoredToken();
            throw new AuthenticationError('Authentication failed');
          }

          throw new ApiRequestError(
            errorData.message || `HTTP ${response.status}`,
            response.status,
            errorData
          );
        }

        const responseText = await response.text();
        if (!responseText) {
          return {} as T;
        }

        return JSON.parse(responseText);
      } catch (error) {
        if (error instanceof TypeError && error.message.includes('fetch')) {
          throw new NetworkError('Network request failed', this.networkService.isConnected());
        }
        throw error;
      }
    };

    // Use retry logic unless skipped
    if (options.skipRetry) {
      return makeRequestOnce();
    }

    const result = await RetryService.withRetry(makeRequestOnce, {
      maxAttempts: this.config.retryAttempts,
      baseDelay: this.config.retryDelay
    });

    if (result.success) {
      return result.data!;
    } else {
      throw result.error;
    }
  }

  /**
   * Get next joke
   */
  async getNextJoke(request: ApiJokeRequest = {}): Promise<ApiJokeResponse> {
    return this.makeRequest<ApiJokeResponse>('/api/next-joke', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  /**
   * Submit feedback for a joke
   */
  async submitFeedback(request: ApiFeedbackRequest): Promise<ApiFeedbackResponse> {
    return this.makeRequest<ApiFeedbackResponse>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  /**
   * Get joke history
   */
  async getHistory(request: ApiHistoryRequest = {}): Promise<ApiHistoryResponse> {
    const params = new URLSearchParams();
    if (request.limit) params.append('limit', request.limit.toString());
    if (request.offset) params.append('offset', request.offset.toString());

    const query = params.toString();
    const endpoint = query ? `/api/history?${query}` : '/api/history';

    return this.makeRequest<ApiHistoryResponse>(endpoint);
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<ApiUserStatsResponse> {
    return this.makeRequest<ApiUserStatsResponse>('/api/stats');
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.isTokenValid();
  }

  /**
   * Get current device UUID
   */
  async getDeviceUUID(): Promise<string> {
    const deviceInfo = await this.deviceService.getDeviceInfo();
    return deviceInfo.uuid;
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest('/health', { skipAuth: true, skipRetry: true });
      return true;
    } catch (error) {
      console.error('API connection test failed:', error);
      return false;
    }
  }

  /**
   * Clear all stored authentication data
   */
  async logout(): Promise<void> {
    await this.clearStoredToken();
  }

  /**
   * Get current configuration
   */
  getConfig(): ApiConfig {
    return { ...this.config };
  }
}

export default ApiClient;