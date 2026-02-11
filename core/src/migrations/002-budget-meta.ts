import type { Database } from 'sql.js'
import type { Migration } from './types.ts'

/**
 * Add budget metadata table.
 * Stores format-level metadata for the .budget container format.
 */
export const migration: Migration = {
  version: 2,
  description: 'Add budget metadata table',

  up(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS _budget_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      INSERT INTO _budget_meta (key, value) VALUES ('format', 'budget-container');
      INSERT INTO _budget_meta (key, value) VALUES ('format_version', '1');
      INSERT INTO _budget_meta (key, value) VALUES ('schema_version', '2');
      INSERT INTO _budget_meta (key, value) VALUES ('generator', '@budget/cli@0.3.0');
    `)
  },
}
