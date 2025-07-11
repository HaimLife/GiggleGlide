// Database model types

export type JokeStyle = 'general' | 'dad' | 'pun' | 'observational' | 'dark' | 'wordplay' | 'knock-knock' | 'oneliners';
export type JokeFormat = 'text' | 'qa' | 'dialogue' | 'story' | 'list';
export type JokeTopic = 'general' | 'animals' | 'food' | 'technology' | 'work' | 'family' | 'travel' | 'sports' | 'science' | 'everyday';
export type JokeTone = 'light' | 'silly' | 'clever' | 'witty' | 'absurd' | 'family-friendly';

export interface Joke {
  id?: number;
  txt: string;
  lang?: string;
  style?: JokeStyle;
  format?: JokeFormat;
  topic?: JokeTopic;
  tone?: JokeTone;
  created_at?: string;
  creator?: string;
  is_flagged?: 0 | 1;
}

export interface UserPreferences {
  id?: number;
  locale?: string;
  push_token?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UserJokeFeedback {
  id?: number;
  user_id: string;
  joke_id: number;
  sentiment: 'like' | 'neutral' | 'dislike';
  ts?: string;
}

export interface Favorite {
  user_id: string;
  joke_id: number;
  ts?: string;
}

export interface SeenJoke {
  user_id: string;
  joke_id: number;
  ts?: string;
}

// Query result types
export interface PaginationOptions {
  offset?: number;
  limit?: number;
}

export interface JokeWithFeedback extends Joke {
  user_sentiment?: 'like' | 'neutral' | 'dislike';
  is_favorite?: boolean;
}

// Filtering options for jokes
export interface JokeFilters {
  lang?: string;
  style?: JokeStyle;
  format?: JokeFormat;
  topic?: JokeTopic;
  tone?: JokeTone;
  excludeSeenBy?: string; // user_id to exclude seen jokes
}

// Sentiment type
export type Sentiment = 'like' | 'neutral' | 'dislike';