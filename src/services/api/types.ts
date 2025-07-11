export interface ApiJokeRequest {
  language?: string;
  exclude_flagged?: boolean;
}

export interface ApiJokeResponse {
  id: number;
  text: string;
  language: string;
  created_at: string;
  creator?: string;
}

export interface ApiFeedbackRequest {
  joke_id: number;
  sentiment: 'like' | 'neutral' | 'dislike';
}

export interface ApiFeedbackResponse {
  success: boolean;
  message: string;
}

export interface ApiHistoryRequest {
  limit?: number;
  offset?: number;
}

export interface ApiJokeHistoryItem {
  id: number;
  text: string;
  language: string;
  created_at: string;
  sentiment?: 'like' | 'neutral' | 'dislike';
  feedback_date?: string;
  is_favorite: boolean;
}

export interface ApiHistoryResponse {
  jokes: ApiJokeHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiUserStatsResponse {
  total_seen: number;
  liked: number;
  disliked: number;
  neutral: number;
  favorites: number;
}

export interface DeviceRegistration {
  device_uuid: string;
  device_info?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  details?: any;
}

export class NetworkError extends Error {
  constructor(message: string, public isConnected: boolean = false) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}