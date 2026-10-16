/**
 * Redis persistence. Devvit Redis has no sets, lists or SCAN, so the layout is
 * hashes plus sorted sets:
 *
 *   act            hash  action id -> StoredAction JSON (hSetNX is the dedup gate)
 *   idx:<type>     zset  action id scored by createdAt, one per action type
 *   types          hash  action type -> "1" (which idx:<type> keys exist)
 *   prior          hash  bare post/comment id -> latest Reddit/AutoModerator removal (FR-8)
 *   prior:idx      zset  bare id scored by that removal's createdAt (retention)
 *   wikihash       hash  wiki page -> content hash of the last write
 *   status         hash  last run / publish bookkeeping
 *   lock           hash  "cycle" -> epoch ms of the run holding the lock
 */
import { MAX_WIKI_ENTRIES, REMOVAL_ACTIONS } from './constants.js';
import { bareContentId } from './render.js';
import type { PriorRemoval, StoredAction } from './types.js';

/** The Redis calls this module makes; satisfied by `redis` from @devvit/web/server. */
export interface RedisLike {
  hGet(key: string, field: string): Promise<string | undefined>;
  hMGet(key: string, fields: string[]): Promise<(string | null)[]>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hDel(key: string, fields: string[]): Promise<number>;
  hKeys(key: string): Promise<string[]>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hLen(key: string): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: { by: 'score' | 'lex' | 'rank'; reverse?: boolean; limit?: { offset: number; count: number } },
  ): Promise<{ member: string; score: number }[]>;
  zRemRangeByScore(key: string, min: number, max: number): Promise<number>;
}

const K = {
  act: 'act',
  idx: (type: string) => `idx:${type}`,
  types: 'types',
  prior: 'prior',
  priorIdx: 'prior:idx',
  wikiHash: 'wikihash',
  status: 'status',
  lock: 'lock',
} as const;

const LOCK_FIELD = 'cycle';
const LOCK_STALE_MS = 120_000;
const CHUNK = 500;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const AUTOMATED_REMOVERS = new Set(['reddit', 'automoderator']);

export class Store {
  constructor(private readonly redis: RedisLike) {}

  /** Store a new action. Returns false when the id was already stored (dedup). */
  async saveAction(row: StoredAction): Promise<boolean> {
    const added = await this.redis.hSetNX(K.act, row.id, JSON.stringify(row));
    if (added !== 1) return false;
    await this.redis.zAdd(K.idx(row.action), { member: row.id, score: row.createdAt });
    await this.redis.hSet(K.types, { [row.action]: '1' });
    if (REMOVAL_ACTIONS.includes(row.action) && row.moderator && AUTOMATED_REMOVERS.has(row.moderator.toLowerCase())) {
      await this.recordPriorRemoval(row);
    }
    return true;
  }

  /** Keep only the newest Reddit/AutoModerator removal per target (Python ORDER BY created_at DESC LIMIT 1). */
  private async recordPriorRemoval(row: StoredAction): Promise<void> {
    const contentId = bareContentId(row.permalink);
    if (!contentId || !row.moderator) return;
    const existing = await this.redis.hGet(K.prior, contentId);
    if (existing) {
      const prev = JSON.parse(existing) as PriorRemoval;
      if (prev.createdAt > row.createdAt) return;
    }
    const prior: PriorRemoval = { moderator: row.moderator, reason: row.reason, createdAt: row.createdAt };
    await this.redis.hSet(K.prior, { [contentId]: JSON.stringify(prior) });
    await this.redis.zAdd(K.priorIdx, { member: contentId, score: row.createdAt });
  }

  /** All prior removals for the targets of the given rows, keyed by bare id. */
  async priorRemovalsFor(rows: StoredAction[]): Promise<Map<string, PriorRemoval>> {
    const ids = [...new Set(rows.map((r) => bareContentId(r.permalink)).filter((id): id is string => id !== null))];
    const out = new Map<string, PriorRemoval>();
    for (const batch of chunks(ids, CHUNK)) {
      const values = await this.redis.hMGet(K.prior, batch);
      values.forEach((v, i) => {
        if (v) out.set(batch[i] as string, JSON.parse(v) as PriorRemoval);
      });
    }
    return out;
  }

  /**
   * The rows the wiki shows: the given action types, created at or after `sinceSec`,
   * newest first, at most MAX_WIKI_ENTRIES (Python get_recent_actions_from_db).
   */
  async loadDisplayRows(actionTypes: readonly string[], sinceSec: number): Promise<StoredAction[]> {
    const candidates: { member: string; score: number }[] = [];
    for (const type of actionTypes) {
      const top = await this.redis.zRange(K.idx(type), 0, MAX_WIKI_ENTRIES - 1, { by: 'rank', reverse: true });
      for (const m of top) if (m.score >= sinceSec) candidates.push(m);
    }
    candidates.sort((a, b) => b.score - a.score);
    const ids = candidates.slice(0, MAX_WIKI_ENTRIES).map((m) => m.member);

    const rows: StoredAction[] = [];
    for (const batch of chunks(ids, CHUNK)) {
      const values = await this.redis.hMGet(K.act, batch);
      for (const v of values) if (v) rows.push(JSON.parse(v) as StoredAction);
    }
    return rows;
  }

  /** Delete everything created before `cutoffSec` (Python cleanup_old_entries). Returns rows removed. */
  async prune(cutoffSec: number): Promise<number> {
    let removed = 0;
    const types = await this.redis.hKeys(K.types);
    for (const type of types) {
      const old = await this.redis.zRange(K.idx(type), 0, cutoffSec - 1, { by: 'score' });
      for (const batch of chunks(old.map((m) => m.member), CHUNK)) {
        removed += await this.redis.hDel(K.act, batch);
      }
      await this.redis.zRemRangeByScore(K.idx(type), 0, cutoffSec - 1);
    }
    const oldPrior = await this.redis.zRange(K.priorIdx, 0, cutoffSec - 1, { by: 'score' });
    for (const batch of chunks(oldPrior.map((m) => m.member), CHUNK)) {
      await this.redis.hDel(K.prior, batch);
    }
    await this.redis.zRemRangeByScore(K.priorIdx, 0, cutoffSec - 1);
    return removed;
  }

  async storedCount(): Promise<number> {
    return this.redis.hLen(K.act);
  }

  async getWikiHash(page: string): Promise<string | undefined> {
    return this.redis.hGet(K.wikiHash, page);
  }

  async setWikiHash(page: string, hash: string): Promise<void> {
    await this.redis.hSet(K.wikiHash, { [page]: hash });
  }

  async setStatus(fields: Record<string, string>): Promise<void> {
    await this.redis.hSet(K.status, fields);
  }

  async getStatus(): Promise<Record<string, string>> {
    return this.redis.hGetAll(K.status);
  }

  /** Single-run lock so the cron and a menu click cannot publish at the same time. */
  async acquireLock(nowMs: number): Promise<boolean> {
    if ((await this.redis.hSetNX(K.lock, LOCK_FIELD, String(nowMs))) === 1) return true;
    const held = Number(await this.redis.hGet(K.lock, LOCK_FIELD));
    if (Number.isFinite(held) && nowMs - held < LOCK_STALE_MS) return false;
    await this.redis.hSet(K.lock, { [LOCK_FIELD]: String(nowMs) });
    return true;
  }

  async releaseLock(): Promise<void> {
    await this.redis.hDel(K.lock, [LOCK_FIELD]);
  }
}
