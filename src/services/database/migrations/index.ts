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
  // Future migrations will be added here
];