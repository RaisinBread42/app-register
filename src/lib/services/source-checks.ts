import {and, eq} from 'drizzle-orm';
import {HOSTING_CHECK_ERROR_MAX_LENGTH} from '@/lib/constants';
import type {AppDatabase} from '@/lib/db/client';
import {sourceChecks} from '@/lib/db/schema';
import {cleanText} from '@/lib/monitoring/feed-values';

/**
 * [31] Each outside source's last check, kept per workspace (spec §8: stale data is
 * visible and never reads as safe): when it was last asked, when it last answered,
 * and why the last attempt failed. A check writes one outcome per source it asked.
 */

/** What one run learnt about one source: null error means it answered. */
export type SourceOutcome = {sourceId: string; error: string | null};

export type SourceCheck = {sourceId: string; lastAttemptAt: Date; lastSuccessAt: Date | null; lastError: string | null};

/** One outcome per source: it answered if any request to it answered, else the first error. */
function bySource(outcomes: SourceOutcome[]): SourceOutcome[] {
  const merged = new Map<string, SourceOutcome>();
  for (const outcome of outcomes) {
    const known = merged.get(outcome.sourceId);
    if (!known || (known.error !== null && outcome.error === null)) {
      merged.set(outcome.sourceId, outcome);
    }
  }
  return [...merged.values()];
}

/** Records a run: every source asked gets its attempt time, and either its answer time or its error. */
export async function recordSourceOutcomes(db: AppDatabase, workspaceId: string, outcomes: SourceOutcome[], at: Date): Promise<void> {
  for (const {sourceId, error} of bySource(outcomes)) {
    const lastError = error === null ? null : cleanText(error, HOSTING_CHECK_ERROR_MAX_LENGTH);
    await db
      .insert(sourceChecks)
      .values({workspaceId, sourceId, lastAttemptAt: at, lastSuccessAt: error === null ? at : null, lastError})
      .onConflictDoUpdate({
        target: [sourceChecks.workspaceId, sourceChecks.sourceId],
        set: {lastAttemptAt: at, lastError, ...(error === null ? {lastSuccessAt: at} : {})},
      });
  }
}

/** The workspace's source checks, by source id. */
export async function listSourceChecks(db: AppDatabase, workspaceId: string): Promise<Map<string, SourceCheck>> {
  const rows = await db.select().from(sourceChecks).where(and(eq(sourceChecks.workspaceId, workspaceId)));
  return new Map(rows.map((row) => [row.sourceId, {sourceId: row.sourceId, lastAttemptAt: row.lastAttemptAt, lastSuccessAt: row.lastSuccessAt, lastError: row.lastError}]));
}
