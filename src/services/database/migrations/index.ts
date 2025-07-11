export interface Migration {
  version: number;
  description: string;
  up: string[];
  down?: string[];
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Initial schema',
    up: [], // Schema is created by SchemaManager
  },
  {
    version: 2,
    description: 'Add joke tagging columns (style, format, topic, tone)',
    up: [
      // Add new columns to jokes table
      `ALTER TABLE jokes ADD COLUMN style TEXT DEFAULT 'general'`,
      `ALTER TABLE jokes ADD COLUMN format TEXT DEFAULT 'text'`,
      `ALTER TABLE jokes ADD COLUMN topic TEXT DEFAULT 'general'`,
      `ALTER TABLE jokes ADD COLUMN tone TEXT DEFAULT 'light'`,
      
      // Create new indexes for performance
      `CREATE INDEX IF NOT EXISTS idx_jokes_style ON jokes(style)`,
      `CREATE INDEX IF NOT EXISTS idx_jokes_format ON jokes(format)`,
      `CREATE INDEX IF NOT EXISTS idx_jokes_topic ON jokes(topic)`,
      `CREATE INDEX IF NOT EXISTS idx_jokes_tone ON jokes(tone)`,
      `CREATE INDEX IF NOT EXISTS idx_jokes_lang_style ON jokes(lang, style)`,
      `CREATE INDEX IF NOT EXISTS idx_jokes_topic_tone ON jokes(topic, tone)`,
    ],
    down: [
      // Remove indexes
      `DROP INDEX IF EXISTS idx_jokes_style`,
      `DROP INDEX IF EXISTS idx_jokes_format`,
      `DROP INDEX IF EXISTS idx_jokes_topic`,
      `DROP INDEX IF EXISTS idx_jokes_tone`,
      `DROP INDEX IF EXISTS idx_jokes_lang_style`,
      `DROP INDEX IF EXISTS idx_jokes_topic_tone`,
      
      // Note: SQLite doesn't support DROP COLUMN directly
      // In production, you'd need to recreate the table without these columns
    ]
  },
  // Future migrations will be added here
];