import { describe, expect, it } from 'vitest';

import { censorEmails, moderatorLabel, sanitizeForMarkdown, storedPermalink, toStoredAction } from '../src/core/record.js';
import { bareContentId, buildWikiContent, contentHash, extractContentId, formatContentLink, modmailLink, pyQuote } from '../src/core/render.js';
import type { PriorRemoval, StoredAction } from '../src/core/types.js';

const NOW = new Date('2026-10-01T12:00:00Z');
const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);
const POST = 'https://reddit.com/r/Sub/comments/abc123/title/';
const COMMENT = 'https://reddit.com/r/Sub/comments/abc123/title/def456/';

function row(over: Partial<StoredAction>): StoredAction {
  return { id: 'a1', action: 'removelink', moderator: 'HumanModerator', permalink: POST, reason: '', targetAuthor: 'op', createdAt: at('2026-10-01T10:00:00Z'), ...over };
}

function render(rows: StoredAction[], priors: Record<string, PriorRemoval> = {}) {
  return buildWikiContent(rows, { subredditName: 'Sub', anonymizeModerators: true, now: NOW, priorRemoval: (id) => priors[id] });
}

const tableRows = (content: string): string[] => content.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Time'));

describe('record mapping', () => {
  it('keeps AutoModerator and Reddit literal and anonymizes humans', () => {
    expect(moderatorLabel('automoderator', true)).toBe('AutoModerator');
    expect(moderatorLabel('REDDIT', true)).toBe('Reddit');
    expect(moderatorLabel('SomeMod', true)).toBe('HumanModerator');
    expect(moderatorLabel(undefined, true)).toBeNull();
  });

  it('never stores a profile link', () => {
    expect(storedPermalink('/u/someone/')).toBeNull();
    expect(storedPermalink('/user/someone/comments/x/')).toBe('https://reddit.com/user/someone/comments/x/');
    expect(storedPermalink('/r/s/comments/u/x/')).toBeNull();
    expect(storedPermalink('/r/Sub/comments/abc/t/')).toBe('https://reddit.com/r/Sub/comments/abc/t/');
  });

  it('censors emails and replaces pipes in reasons', () => {
    expect(censorEmails('mail a.b@example.co.uk now')).toBe('mail [EMAIL] now');
    expect(sanitizeForMarkdown('a|b')).toBe('a b');
  });

  it('reads addremovalreason text from description and others from details', () => {
    const base = { id: 'x', moderatorName: 'm', createdAt: NOW };
    expect(toStoredAction({ ...base, type: 'addremovalreason', description: ' Rule 1 ', details: 'ignored' }, true).reason).toBe('Rule 1');
    expect(toStoredAction({ ...base, type: 'removelink', description: 'ignored', details: 'spam' }, true).reason).toBe('spam');
    expect(toStoredAction({ ...base, type: 'removelink' }, true).reason).toBe('');
  });
});

describe('render helpers', () => {
  it('extracts post and comment ids from permalinks', () => {
    expect(extractContentId(POST)).toBe('t3_abc123');
    expect(extractContentId(COMMENT)).toBe('t1_def456');
    expect(bareContentId(null)).toBeNull();
  });

  it('labels comments and posts and falls back to [deleted]', () => {
    expect(formatContentLink(row({ permalink: COMMENT }))).toBe('[Comment by u/op](https://www.reddit.com/r/Sub/comments/abc123/title/def456/)');
    expect(formatContentLink(row({ targetAuthor: null }))).toBe('[Post by u/[deleted]](https://www.reddit.com/r/Sub/comments/abc123/title/)');
    expect(formatContentLink(row({ permalink: null }))).toBe('Post by u/op');
  });

  it('quotes like urllib.parse.quote', () => {
    expect(pyQuote("a/b c!'()*é")).toBe('a/b%20c%21%27%28%29%2A%C3%A9');
  });

  it('builds a modmail link carrying the content id', () => {
    const link = modmailLink('Sub', row({ action: 'spamcomment', permalink: COMMENT }));
    expect(link).toMatch(/^\[Contact Mods\]\(https:\/\/www\.reddit\.com\/message\/compose\?to=\/r\/Sub&subject=Spam%20Comment%20Removal%20Inquiry/);
    expect(link).toContain('%5BID%3A%20def456%5D');
  });
});

describe('FR-7 removal and reason merging', () => {
  it('merges a removal and its addremovalreason into one row', () => {
    const { content } = render([
      row({ id: 'r', action: 'addremovalreason', reason: 'Rule 3', createdAt: at('2026-10-01T10:01:00Z') }),
      row({ id: 'x', action: 'removelink', reason: '' }),
    ]);
    const rows = tableRows(content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('| removelink |');
    expect(rows[0]).toContain('| Rule 3 |');
  });

  it('keeps a reason row when no removal of that target is shown', () => {
    const rows = tableRows(render([row({ action: 'addremovalreason', reason: 'Rule 3' })]).content);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('| addremovalreason |');
  });

  it('shows a second removal of the same target as its own row', () => {
    const rows = tableRows(render([row({ id: 'a' }), row({ id: 'b', action: 'spamlink', createdAt: at('2026-10-01T09:00:00Z') })]).content);
    expect(rows).toHaveLength(2);
  });
});

describe('FR-8 approval gating', () => {
  const approval = row({ id: 'ap', action: 'approvelink' });

  it('drops an approval with no prior automated removal', () => {
    expect(render([approval]).rows).toBe(0);
  });

  it('annotates an approval that reverses an AutoModerator removal', () => {
    const rows = tableRows(render([approval], { abc123: { moderator: 'AutoModerator', reason: 'karma', createdAt: 1 } }).content);
    expect(rows[0]).toContain('| Approved AutoModerator removal: karma |');
  });

  it('omits an empty or "-" prior reason', () => {
    const rows = tableRows(render([approval], { abc123: { moderator: 'Reddit', reason: '-', createdAt: 1 } }).content);
    expect(rows[0]).toContain('| Approved Reddit removal |');
  });

  it('matches the exact target id, not a comment under an approved post', () => {
    expect(render([approval], { def456: { moderator: 'AutoModerator', reason: 'x', createdAt: 1 } }).rows).toBe(0);
  });
});

describe('page layout', () => {
  it('prefixes AutoModerator removals with filter-', () => {
    expect(tableRows(render([row({ moderator: 'AutoModerator' })]).content)[0]).toContain('| filter-removelink |');
  });

  it('groups by UTC day, newest first', () => {
    const { content } = render([row({ id: 'a' }), row({ id: 'b', createdAt: at('2026-09-29T23:59:59Z') })]);
    expect(content.indexOf('## 2026-10-01')).toBeLessThan(content.indexOf('## 2026-09-29'));
  });

  it('renders the empty-page text with no rows', () => {
    expect(render([]).content).toBe('**Last Updated:** 2026-10-01 12:00:00 UTC\n\n---\n\nNo recent moderation actions found.');
  });

  it('trims the oldest days to stay under 90% of the 512 KiB limit', () => {
    const big = 'x'.repeat(4000);
    const rows: StoredAction[] = [];
    for (let d = 0; d < 200; d++) {
      rows.push(row({ id: `r${d}`, reason: big, createdAt: at('2026-10-01T10:00:00Z') - d * 86400, permalink: `https://reddit.com/r/Sub/comments/p${d}/t/` }));
    }
    const result = render(rows);
    expect(result.trimmedDays).toBeGreaterThan(0);
    expect(Buffer.byteLength(result.content)).toBeLessThan(Math.floor(524288 * 0.9) + 200);
    expect(result.content).toContain('older day(s) trimmed due to wiki size limits.');
  });

  it('hashes without the Last Updated line', () => {
    const a = render([row({})]).content;
    const b = buildWikiContent([row({})], { subredditName: 'Sub', anonymizeModerators: true, now: new Date('2027-01-01T00:00:00Z'), priorRemoval: () => undefined }).content;
    expect(a).not.toBe(b);
    expect(contentHash(a)).toBe(contentHash(b));
  });
});
