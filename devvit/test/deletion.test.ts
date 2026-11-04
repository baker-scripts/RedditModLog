import { redis } from '@devvit/web/server';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { expect } from 'vitest';

import { bareId, scrubDeleted, shouldScrub } from '../src/core/deletion.js';
import { runCycle } from '../src/core/publish.js';
import { Store } from '../src/core/store.js';
import type { StoredAction } from '../src/core/types.js';
import { FakeReddit, config } from './helpers.js';

const test = createDevvitTest();
const P = (id: string) => `https://reddit.com/r/Sub/comments/${id}/t/`;
const NOW = new Date('2026-11-03T12:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);

function row(over: Partial<StoredAction>): StoredAction {
  return { id: 'a1', action: 'removelink', moderator: 'HumanModerator', permalink: P('p1'), reason: 'secret reason', targetAuthor: 'victim', createdAt: nowSec - 60, ...over };
}

test('shouldScrub keeps rows only for MODERATOR deletions', () => {
  for (const s of [1, 2, 'USER', 'ADMIN', 0, undefined]) expect(shouldScrub(s)).toBe(true);
  for (const s of [3, 'MODERATOR']) expect(shouldScrub(s)).toBe(false);
});

test('bareId strips prefixes and rejects empty ids', () => {
  expect(bareId('t3_abc')).toBe('abc');
  expect(bareId('t1_xyz')).toBe('xyz');
  expect(bareId('')).toBeNull();
  expect(bareId(undefined)).toBeNull();
});

test('a USER deletion scrubs rows and a forced rebuild drops the identifying text from the wiki', async () => {
  const store = new Store(redis);
  await store.saveAction(row({}));
  const reddit = new FakeReddit([]);
  const cfg = config();
  await runCycle(reddit, store, cfg, 'force-rebuild', NOW);
  expect(reddit.pages.get(cfg.wikiPage)).toContain('victim');

  expect(await scrubDeleted(store, 't3_p1', 1)).toBe(1);
  await runCycle(reddit, store, cfg, 'force-rebuild', NOW);
  const page = reddit.pages.get(cfg.wikiPage) as string;
  expect(page).not.toContain('victim');
  expect(page).not.toContain('secret reason');
  expect(page).not.toContain('/comments/p1/');
});

test('an ADMIN deletion scrubs too', async () => {
  const store = new Store(redis);
  await store.saveAction(row({}));
  expect(await scrubDeleted(store, 't3_p1', 'ADMIN')).toBe(1);
});

test('a MODERATOR deletion leaves rows untouched', async () => {
  const store = new Store(redis);
  await store.saveAction(row({}));
  expect(await scrubDeleted(store, 't3_p1', 'MODERATOR')).toBe(0);
  expect((await store.loadDisplayRows(['removelink'], 0))[0]).toMatchObject({ targetAuthor: 'victim', reason: 'secret reason' });
});

test('an unknown target scrubs nothing', async () => {
  const store = new Store(redis);
  await store.saveAction(row({}));
  expect(await scrubDeleted(store, 't1_other', 1)).toBe(0);
  expect(await scrubDeleted(store, undefined, 1)).toBe(0);
});
