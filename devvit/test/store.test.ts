import { redis } from '@devvit/web/server';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { expect } from 'vitest';

import { Store } from '../src/core/store.js';
import type { StoredAction } from '../src/core/types.js';

const test = createDevvitTest();
const P = (id: string) => `https://reddit.com/r/Sub/comments/${id}/t/`;

function row(over: Partial<StoredAction>): StoredAction {
  return { id: 'a1', action: 'removelink', moderator: 'HumanModerator', permalink: P('p1'), reason: '', targetAuthor: 'op', createdAt: 1_000, ...over };
}

test('saveAction dedups by action id', async () => {
  const store = new Store(redis);
  expect(await store.saveAction(row({}))).toBe(true);
  expect(await store.saveAction(row({ reason: 'changed' }))).toBe(false);
  expect(await store.storedCount()).toBe(1);
});

test('loadDisplayRows filters by type and window, newest first', async () => {
  const store = new Store(redis);
  await store.saveAction(row({ id: 'old', createdAt: 100 }));
  await store.saveAction(row({ id: 'mid', createdAt: 500, action: 'spamlink' }));
  await store.saveAction(row({ id: 'new', createdAt: 900 }));
  await store.saveAction(row({ id: 'ban', createdAt: 950, action: 'banuser' }));

  const rows = await store.loadDisplayRows(['removelink', 'spamlink'], 200);
  expect(rows.map((r) => r.id)).toEqual(['new', 'mid']);
});

test('prior removals keep only the newest Reddit/AutoModerator removal per target', async () => {
  const store = new Store(redis);
  await store.saveAction(row({ id: 'h', moderator: 'HumanModerator', createdAt: 50 }));
  expect((await store.priorRemovalsFor([row({})])).size).toBe(0);

  await store.saveAction(row({ id: 'a', moderator: 'AutoModerator', reason: 'first', createdAt: 100 }));
  await store.saveAction(row({ id: 'b', moderator: 'Reddit', reason: 'second', createdAt: 300 }));
  await store.saveAction(row({ id: 'c', moderator: 'AutoModerator', reason: 'older', createdAt: 200 }));

  const priors = await store.priorRemovalsFor([row({ action: 'approvelink' })]);
  expect(priors.get('p1')).toEqual({ moderator: 'Reddit', reason: 'second', createdAt: 300 });
});

test('prune deletes rows and prior removals older than the cutoff', async () => {
  const store = new Store(redis);
  await store.saveAction(row({ id: 'old', moderator: 'AutoModerator', createdAt: 100, permalink: P('p_old') }));
  await store.saveAction(row({ id: 'new', createdAt: 900, permalink: P('p_new') }));

  expect(await store.prune(500)).toBe(1);
  expect(await store.storedCount()).toBe(1);
  expect((await store.loadDisplayRows(['removelink'], 0)).map((r) => r.id)).toEqual(['new']);
  expect((await store.priorRemovalsFor([row({ permalink: P('p_old') })])).size).toBe(0);
});

test('the run lock blocks a second holder until released or stale', async () => {
  const store = new Store(redis);
  expect(await store.acquireLock(1_000)).toBe(true);
  expect(await store.acquireLock(2_000)).toBe(false);
  expect(await store.acquireLock(1_000 + 121_000)).toBe(true);
  await store.releaseLock();
  expect(await store.acquireLock(500_000)).toBe(true);
});

test('wiki hash and status round-trip', async () => {
  const store = new Store(redis);
  await store.setWikiHash('modlog-devvit', 'abc');
  expect(await store.getWikiHash('modlog-devvit')).toBe('abc');
  expect(await store.getWikiHash('modlog')).toBeUndefined();
  await store.setStatus({ lastResult: 'published' });
  expect((await store.getStatus()).lastResult).toBe('published');
});
