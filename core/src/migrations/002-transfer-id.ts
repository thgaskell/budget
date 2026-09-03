import type { Database } from 'sql.js'
import type { Migration } from './types.ts'

/**
 * Record the other leg of a transfer explicitly.
 *
 * Until now a pair was only recorded as `transfer_account_id` on each side and the
 * partner was searched for by account, amount and date. Two transfers of the same
 * amount between the same accounts on the same day are indistinguishable that way, so
 * the search could pair - and then delete or edit - a leg of a different pair.
 *
 * `transfer_id` holds the partner's id, so a pair is only ever what a caller named.
 *
 * Existing rows are deliberately left with `transfer_id` NULL: pairing them up would
 * mean running the same guesswork this column exists to remove. They keep their
 * `transfer_account_id`, so they are still treated as transfers by the budget rules
 * (kept out of Ready to Assign and category activity), but every operation that would
 * change the pair refuses to act on them until the user re-links the two legs by id.
 */
export const migration: Migration = {
  version: 2,
  description: 'Record the transfer partner by transaction id',

  up(db: Database): void {
    db.run(`
      -- No foreign key: the two legs point at each other, and a circular reference
      -- cannot be satisfied by either insert on its own once enforcement is on
      ALTER TABLE transactions ADD COLUMN transfer_id TEXT;

      CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(transfer_id);
    `)
  },
}
