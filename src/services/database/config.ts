export const DATABASE_CONFIG = {
  name: 'giggleglide.db',
  version: 1,
  description: 'GiggleGlide local database',
  size: 10485760, // 10MB
};

export const TABLES = {
  JOKES: 'jokes',
  USER_PREFERENCES: 'user_preferences',
  USER_JOKE_FEEDBACK: 'user_joke_feedback',
  SEEN_JOKES: 'seen_jokes',
  FAVORITES: 'favorites',
  DB_VERSION: 'db_version',
} as const;