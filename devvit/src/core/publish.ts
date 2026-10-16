/**
 * One publish cycle, shared by the cron task and the menu actions. Mirrors the
 * Python continuous loop: ingest new mod-log entries, rebuild the page from
 * stored rows, skip the write when the content hash is unchanged, then prune.
 */
import { FETCH_LIMIT, REDDIT_WIKI_LIMIT, WRITE_WARNING_THRESHOLD } from './constants.js';
import { isIgnoredModerator, toStoredAction } from './record.js';
import { buildWikiContent, contentHash } from './render.js';
import type { Store } from './store.js';
import type { AppConfig, ModLogEntry } from './types.js';

/** The Reddit calls a cycle needs. Production wiring lives in src/server/reddit.ts. */
export interface RedditPort {
  fetchModLog(subredditName: string, limit: number): Promise<ModLogEntry[]>;
  /** Current page markdown, or null when the page does not exist. */
  readWiki(subredditName: string, page: string): Promise<string | null>;
  writeWiki(subredditName: string, page: string, content: string, exists: boolean): Promise<void>;
}

export type CycleMode = 'scheduled' | 'publish-now' | 'force-rebuild';

export interface CycleResult {
  status: 'published' | 'unchanged' | 'no-actions' | 'busy';
  ingested: number;
  scanned: number;
  rows: number;
  bytes: number;
  pruned: number;
  trimmedDays: number;
}

const DAY_SEC = 86_400;
const utf8Bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

/** Store new entries oldest first so an interrupted run never leaves a gap behind a stored id. */
export async function ingest(reddit: RedditPort, store: Store, cfg: AppConfig, nowSec: number): Promise<{ ingested: number; scanned: number }> {
  const entries = await reddit.fetchModLog(cfg.subredditName, FETCH_LIMIT);
  const cutoff = nowSec - cfg.retentionDays * DAY_SEC;
  let ingested = 0;
  for (const entry of [...entries].reverse()) {
    if (isIgnoredModerator(entry.moderatorName, cfg.ignoredModerators)) continue;
    const row = toStoredAction(entry, cfg.anonymizeModerators);
    if (row.createdAt < cutoff) continue;
    if (await store.saveAction(row)) ingested += 1;
  }
  return { ingested, scanned: entries.length };
}

export async function runCycle(reddit: RedditPort, store: Store, cfg: AppConfig, mode: CycleMode, now: Date = new Date()): Promise<CycleResult> {
  const nowSec = Math.floor(now.getTime() / 1000);
  const result: CycleResult = { status: 'no-actions', ingested: 0, scanned: 0, rows: 0, bytes: 0, pruned: 0, trimmedDays: 0 };

  if (!(await store.acquireLock(now.getTime()))) return { ...result, status: 'busy' };
  try {
    await store.setStatus({ lastRunAt: now.toISOString(), lastMode: mode });

    // Force rebuild matches Python --force-wiki: rebuild from storage without fetching.
    if (mode !== 'force-rebuild') Object.assign(result, await ingest(reddit, store, cfg, nowSec));

    const rows = await store.loadDisplayRows(cfg.wikiActions, nowSec - cfg.displayDays * DAY_SEC);
    if (rows.length === 0) {
      // Python skips the wiki write when storage holds no displayable actions.
      result.pruned = await store.prune(nowSec - cfg.retentionDays * DAY_SEC);
      await store.setStatus({ lastResult: 'no-actions' });
      return result;
    }

    const priors = await store.priorRemovalsFor(rows);
    const rendered = buildWikiContent(rows, {
      subredditName: cfg.subredditName,
      anonymizeModerators: cfg.anonymizeModerators,
      now,
      priorRemoval: (id) => priors.get(id),
    });
    result.rows = rendered.rows;
    result.trimmedDays = rendered.trimmedDays;
    result.bytes = utf8Bytes(rendered.content);

    const hash = contentHash(rendered.content);
    const force = mode === 'force-rebuild';
    if (!force && (await store.getWikiHash(cfg.wikiPage)) === hash) {
      result.status = 'unchanged';
    } else {
      const existing = await reddit.readWiki(cfg.subredditName, cfg.wikiPage);
      if (existing !== null) {
        const existingBytes = utf8Bytes(existing);
        if (existingBytes > WRITE_WARNING_THRESHOLD && result.bytes >= existingBytes) {
          throw new Error(
            `Wiki page already at ${existingBytes} bytes of ${REDDIT_WIKI_LIMIT}; refusing to grow it. Lower the display days.`,
          );
        }
      }
      await reddit.writeWiki(cfg.subredditName, cfg.wikiPage, rendered.content, existing !== null);
      await store.setWikiHash(cfg.wikiPage, hash);
      result.status = 'published';
      await store.setStatus({ lastPublishAt: now.toISOString() });
    }

    result.pruned = await store.prune(nowSec - cfg.retentionDays * DAY_SEC);
    await store.setStatus({ lastResult: result.status, lastError: '' });
    return result;
  } catch (err) {
    await store.setStatus({ lastResult: 'error', lastError: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    await store.releaseLock();
  }
}

export function describeResult(r: CycleResult, page: string): string {
  switch (r.status) {
    case 'busy':
      return 'Another publish is already running. Try again in a minute.';
    case 'no-actions':
      return `No moderation actions to publish yet (${r.ingested} new, ${r.scanned} scanned).`;
    case 'unchanged':
      return `wiki/${page} is already current (${r.ingested} new actions, ${r.rows} rows).`;
    case 'published':
      return `Published wiki/${page}: ${r.rows} rows, ${r.bytes} bytes, ${r.ingested} new actions.`;
  }
}
