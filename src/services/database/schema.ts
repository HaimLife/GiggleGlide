import { TABLES } from './config';

export const SCHEMA_STATEMENTS = [
  // Database version tracking
  `CREATE TABLE IF NOT EXISTS ${TABLES.DB_VERSION} (
    version INTEGER PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Jokes table
  `CREATE TABLE IF NOT EXISTS ${TABLES.JOKES} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    txt TEXT NOT NULL,
    lang TEXT DEFAULT 'en',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    creator TEXT,
    is_flagged INTEGER DEFAULT 0,
    CHECK (is_flagged IN (0, 1))
  )`,

  // User preferences table
  `CREATE TABLE IF NOT EXISTS ${TABLES.USER_PREFERENCES} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    locale TEXT DEFAULT 'en',
    push_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // User joke feedback table
  `CREATE TABLE IF NOT EXISTS ${TABLES.USER_JOKE_FEEDBACK} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    joke_id INTEGER NOT NULL,
    sentiment TEXT NOT NULL,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (joke_id) REFERENCES ${TABLES.JOKES}(id),
    CHECK (sentiment IN ('like', 'neutral', 'dislike'))
  )`,

  // Seen jokes table
  `CREATE TABLE IF NOT EXISTS ${TABLES.SEEN_JOKES} (
    user_id TEXT NOT NULL,
    joke_id INTEGER NOT NULL,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, joke_id),
    FOREIGN KEY (joke_id) REFERENCES ${TABLES.JOKES}(id)
  )`,

  // Favorites table
  `CREATE TABLE IF NOT EXISTS ${TABLES.FAVORITES} (
    user_id TEXT NOT NULL,
    joke_id INTEGER NOT NULL,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, joke_id),
    FOREIGN KEY (joke_id) REFERENCES ${TABLES.JOKES}(id)
  )`,
];

export const INDEX_STATEMENTS = [
  // Indexes for performance
  `CREATE INDEX IF NOT EXISTS idx_jokes_lang ON ${TABLES.JOKES}(lang)`,
  `CREATE INDEX IF NOT EXISTS idx_jokes_is_flagged ON ${TABLES.JOKES}(is_flagged)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON ${TABLES.USER_JOKE_FEEDBACK}(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_joke_id ON ${TABLES.USER_JOKE_FEEDBACK}(joke_id)`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_sentiment ON ${TABLES.USER_JOKE_FEEDBACK}(sentiment)`,
  `CREATE INDEX IF NOT EXISTS idx_seen_jokes_ts ON ${TABLES.SEEN_JOKES}(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON ${TABLES.FAVORITES}(user_id)`,
];