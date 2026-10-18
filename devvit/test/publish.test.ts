import { redis } from '@devvit/web/server';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { expect } from 'vitest';

import { REDDIT_WIKI_LIMIT } from '../src/core/constants.js';
import { runCycle } from '../src/core/publish.js';
import { Store } from '../src/core/store.js';
import { config, FakeReddit, loadFixture, toModLog } from './helpers.js';

const test = createDevvitTest();
const fixture = loadFixture();
const NOW = new Date(fixture.base * 1000);
const LATER = new Date((fixture.base + 1200) * 1000);

test('second scheduled run with no new actions skips the wiki write', async () => {
  const reddit = new FakeReddit(toModLog(fixture));
  const store = new Store(redis);
  expect((await runCycle(reddit, store, config(), 'scheduled', NOW)).status).toBe('published');
  const second = await runCycle(reddit, store, config(), 'scheduled', LATER);
  expect(second.status).toBe('unchanged');
  expect(second.ingested).toBe(0);
  expect(reddit.writes).toHaveLength(1);
});

test('force rebuild rewrites from storage without fetching the mod log', async () => {
  const reddit = new FakeReddit(toModLog(fixture));
  const store = new Store(redis);
  await runCycle(reddit, store, config(), 'scheduled', NOW);
  const fetches = reddit.fetches;
  const result = await runCycle(reddit, store, config(), 'force-rebuild', LATER);
  expect(result.status).toBe('published');
  expect(reddit.fetches).toBe(fetches);
  expect(reddit.writes).toHaveLength(2);
  expect(reddit.writes[1]?.exists).toBe(true);
});

test('ignored moderators are never stored or shown', async () => {
  const reddit = new FakeReddit(toModLog(fixture));
  await runCycle(reddit, new Store(redis), config({ ignoredModerators: ['automoderator'] }), 'scheduled', NOW);
  const page = reddit.writes[0]?.content ?? '';
  expect(page).not.toContain('filter-');
  // Without the stored AutoModerator removal the comment approval has nothing to reverse.
  expect(page).not.toContain('Approved AutoModerator removal');
});

test('an empty mod log publishes nothing', async () => {
  const reddit = new FakeReddit([]);
  const result = await runCycle(reddit, new Store(redis), config(), 'publish-now', NOW);
  expect(result.status).toBe('no-actions');
  expect(reddit.writes).toHaveLength(0);
});

test('a page above 95% of the limit is replaced by smaller trimmed content', async () => {
  const reddit = new FakeReddit(toModLog(fixture));
  reddit.pages.set('modlog-devvit', 'x'.repeat(Math.floor(REDDIT_WIKI_LIMIT * 0.96)));
  reddit.log = [];
  await expect(runCycle(reddit, new Store(redis), config(), 'scheduled', NOW)).resolves.toMatchObject({ status: 'no-actions' });
  reddit.log = toModLog(fixture);
  const smaller = await runCycle(reddit, new Store(redis), config(), 'scheduled', NOW);
  expect(smaller.status).toBe('published');
});

test('a busy lock returns busy without touching the wiki', async () => {
  const reddit = new FakeReddit(toModLog(fixture));
  const store = new Store(redis);
  await store.acquireLock(NOW.getTime());
  expect((await runCycle(reddit, store, config(), 'publish-now', NOW)).status).toBe('busy');
  expect(reddit.fetches).toBe(0);
});

test('entries older than retention are not ingested', async () => {
  const reddit = new FakeReddit(toModLog(fixture));
  const result = await runCycle(reddit, new Store(redis), config(), 'scheduled', NOW);
  expect(result.scanned).toBe(fixture.entries.length);
  expect(result.ingested).toBe(fixture.entries.length - 1);
  expect(reddit.writes[0]?.content).not.toContain('1abcold');
});
