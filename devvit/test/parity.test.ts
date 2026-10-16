/**
 * Golden parity: parity/golden.md is the output of modlog_wiki_publisher.py's
 * build_wiki_content for parity/fixture.json (see parity/python_render.py; CI
 * regenerates it and fails on drift). The TS pipeline must match it byte for byte.
 */
import { readFileSync } from 'node:fs';

import { redis } from '@devvit/web/server';
import { createDevvitTest } from '@devvit/test/server/vitest';
import { expect } from 'vitest';

import { runCycle } from '../src/core/publish.js';
import { Store } from '../src/core/store.js';
import { config, FakeReddit, loadFixture, parityDir, toModLog } from './helpers.js';

const test = createDevvitTest();

test('TS pipeline output equals the Python golden file', async () => {
  const fixture = loadFixture();
  const golden = readFileSync(`${parityDir}golden.md`, 'utf8');
  const reddit = new FakeReddit(toModLog(fixture));

  const result = await runCycle(reddit, new Store(redis), config({ subredditName: fixture.subreddit }), 'scheduled', new Date(fixture.base * 1000));

  expect(result.status).toBe('published');
  expect(reddit.writes).toHaveLength(1);
  expect(reddit.writes[0]?.content).toBe(golden);
});
