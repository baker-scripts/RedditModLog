import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { RedditPort } from '../src/core/publish.js';
import type { AppConfig, ModLogEntry } from '../src/core/types.js';

export interface FixtureEntry {
  id: string;
  type: string;
  moderatorName: string;
  ageSec: number;
  description?: string;
  details?: string;
  target?: { id: string; author?: string; permalink?: string };
}

export interface Fixture {
  base: number;
  subreddit: string;
  entries: FixtureEntry[];
}

export const parityDir = fileURLToPath(new URL('./parity/', import.meta.url));

export function loadFixture(): Fixture {
  return JSON.parse(readFileSync(`${parityDir}fixture.json`, 'utf8')) as Fixture;
}

export function toModLog(fixture: Fixture): ModLogEntry[] {
  return fixture.entries.map((e) => ({
    id: e.id,
    type: e.type,
    moderatorName: e.moderatorName,
    createdAt: new Date((fixture.base - e.ageSec) * 1000),
    description: e.description,
    details: e.details,
    target: e.target,
  }));
}

export function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    subredditName: 'OpenSignups',
    wikiPage: 'modlog-devvit',
    retentionDays: 90,
    displayDays: 90,
    wikiActions: ['removelink', 'removecomment', 'spamlink', 'spamcomment', 'addremovalreason', 'approvelink', 'approvecomment'],
    anonymizeModerators: true,
    ignoredModerators: [],
    ...overrides,
  };
}

/** In-memory RedditPort: Devvit's test harness does not implement Moderation or Wiki. */
export class FakeReddit implements RedditPort {
  pages = new Map<string, string>();
  writes: { page: string; content: string; exists: boolean }[] = [];
  fetches = 0;

  constructor(public log: ModLogEntry[]) {}

  async fetchModLog(_sub: string, limit: number): Promise<ModLogEntry[]> {
    this.fetches += 1;
    return this.log.slice(0, limit);
  }

  async readWiki(_sub: string, page: string): Promise<string | null> {
    return this.pages.get(page) ?? null;
  }

  async writeWiki(_sub: string, page: string, content: string, exists: boolean): Promise<void> {
    this.pages.set(page, content);
    this.writes.push({ page, content, exists });
  }
}
