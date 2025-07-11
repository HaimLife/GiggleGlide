// Database model types

export interface Joke {
  id?: number;
  txt: string;
  lang?: string;
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