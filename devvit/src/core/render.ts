/**
 * Pure wiki renderer ported from build_wiki_content and its helpers in
 * modlog_wiki_publisher.py. Output is byte-identical to Python for the same
 * stored rows; test/parity.test.ts holds the golden comparison.
 */
import { createHash } from 'node:crypto';

import {
  APPROVAL_ACTIONS,
  MAX_WIKI_ENTRIES,
  REASON_ACTIONS,
  REDDIT_WIKI_LIMIT,
  REMOVAL_ACTIONS,
  TRIM_THRESHOLD,
} from './constants.js';
import { moderatorLabel, sanitizeForMarkdown } from './record.js';
import type { PriorRemoval, StoredAction } from './types.js';

export const FOOTER_LINES: readonly string[] = [
  '---',
  '',
  '*This modlog is automatically maintained by [RedditModLog](https://github.com/bakerboy448/RedditModLog) bot.*',
];

const REMOVAL_TYPE_LABELS: Readonly<Record<string, string>> = {
  removelink: 'Post',
  removepost: 'Post',
  removecomment: 'Comment',
  spamlink: 'Spam Post',
  spamcomment: 'Spam Comment',
  removecontent: 'Content',
  addremovalreason: 'Removal Reason',
};

const MAX_TITLE_LENGTH = 50;

export interface RenderOptions {
  subredditName: string;
  anonymizeModerators: boolean;
  now: Date;
  /** Latest Reddit/AutoModerator removal of a bare post/comment id, if any. */
  priorRemoval: (contentId: string) => PriorRemoval | undefined;
}

export interface RenderResult {
  content: string;
  rows: number;
  trimmedDays: number;
}

/** A stored row plus the per-render annotations Python sets on its mock objects. */
interface RenderRow {
  row: StoredAction;
  combinedReason?: string;
  approvalContext?: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function formatUtcDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function formatUtcTime(d: Date): string {
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

const rowDate = (row: StoredAction): Date => new Date(row.createdAt * 1000);

/** extract_content_id_from_permalink: "t1_<id>" for comments, "t3_<id>" for posts. */
export function extractContentId(permalink: string | null | undefined): string | null {
  if (!permalink) return null;
  const comment = /\/comments\/[a-zA-Z0-9]+\/[^/]*\/([a-zA-Z0-9]+)\/?/.exec(permalink);
  if (comment) return `t1_${comment[1]}`;
  const post = /\/comments\/([a-zA-Z0-9]+)\//.exec(permalink);
  if (post) return `t3_${post[1]}`;
  return null;
}

/** Bare id without the t1_/t3_ prefix. */
export function bareContentId(permalink: string | null | undefined): string | null {
  const id = extractContentId(permalink);
  return id ? id.replace('t3_', '').replace('t1_', '') : null;
}

/** The DB mock stores the permalink relative to https://reddit.com. */
function relativePermalink(row: StoredAction): string | null {
  const p = row.permalink;
  if (!p) return null;
  return p.startsWith('https://reddit.com') ? p.replaceAll('https://reddit.com', '') : p;
}

function shortContentId(row: StoredAction): string {
  const rel = relativePermalink(row);
  if (!rel) return '-';
  const id = extractContentId(rel);
  return id ? id.replace('t3_', '').replace('t1_', '').slice(0, 8) : '-';
}

/** format_content_link. Links only ever point at the post/comment, never a profile. */
export function formatContentLink(row: StoredAction): string {
  const rel = relativePermalink(row);
  let link = '';
  if (rel) link = `https://www.reddit.com${rel}`;
  else if (row.permalink) link = row.permalink;

  const isComment = Boolean(rel && rel.includes('/comments/') && rel.split('/').length - 1 > 6);
  const author = row.targetAuthor ? row.targetAuthor : '[deleted]';
  let title = `${isComment ? 'Comment' : 'Post'} by u/${author}`;
  if (link) title = `[${title}](${link})`;
  return sanitizeForMarkdown(title);
}

/** urllib.parse.quote with the default safe="/". */
export function pyQuote(text: string): string {
  return encodeURIComponent(text)
    .replaceAll('%2F', '/')
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** generate_modmail_link: a prefilled removal-inquiry modmail to the subreddit. */
export function modmailLink(subreddit: string, row: StoredAction): string {
  const removalType = REMOVAL_TYPE_LABELS[row.action] ?? 'Content';
  const contentId = shortContentId(row);

  let title = row.targetAuthor ? `Content by u/${row.targetAuthor}` : 'Unknown content';
  const chars = Array.from(title);
  if (chars.length > MAX_TITLE_LENGTH) title = `${chars.slice(0, MAX_TITLE_LENGTH - 3).join('')}...`;

  let url = '';
  if (row.permalink) url = row.permalink;

  const subject = `${removalType} Removal Inquiry - ${title} [ID: ${contentId}]`;
  const body =
    `Hello Moderators of /r/${subreddit},\n\n` +
    `I would like to inquire about the recent removal of the following ${removalType.toLowerCase()}:\n\n` +
    `**Content ID:** ${contentId}\n\n` +
    `**Title:** ${title}\n\n` +
    `**Action Type:** ${row.action}\n\n` +
    `**Link:** ${url}\n\n` +
    'Please provide details regarding this action.\n\n' +
    'Thank you!';

  const href = `https://www.reddit.com/message/compose?to=/r/${subreddit}&subject=${pyQuote(subject)}&message=${pyQuote(body)}`;
  return `[Contact Mods](${href})`;
}

function formatEntry(r: RenderRow, opts: RenderOptions): string {
  const { row } = r;
  let reasonText = '-';
  if (r.combinedReason) reasonText = r.combinedReason.trim();
  else if (r.approvalContext) reasonText = r.approvalContext.trim();
  else if (row.reason) reasonText = row.reason.trim();

  let displayAction = row.action;
  if (REMOVAL_ACTIONS.includes(row.action) && moderatorLabel(row.moderator, false) === 'AutoModerator') {
    displayAction = `filter-${row.action}`;
  }

  const time = `${formatUtcTime(rowDate(row))} UTC`;
  const moderator = moderatorLabel(row.moderator, opts.anonymizeModerators) ?? 'Unknown';
  const cells = [
    time,
    displayAction,
    shortContentId(row),
    moderator,
    formatContentLink(row),
    sanitizeForMarkdown(reasonText),
    modmailLink(opts.subredditName, row),
  ];
  return `| ${cells.join(' | ')} |`;
}

/**
 * FR-8: keep an approval only when it reverses a Reddit/AutoModerator removal of
 * the same post/comment, and annotate it with that removal.
 */
function gateApprovals(rows: StoredAction[], opts: RenderOptions): RenderRow[] {
  const out: RenderRow[] = [];
  for (const row of rows) {
    if (!APPROVAL_ACTIONS.includes(row.action)) {
      out.push({ row });
      continue;
    }
    const contentId = bareContentId(row.permalink);
    if (!contentId) continue;
    const prior = opts.priorRemoval(contentId);
    if (!prior) continue;
    let context = `Approved ${prior.moderator} removal`;
    const reason = prior.reason.trim();
    if (reason && prior.reason !== '-') context += `: ${reason}`;
    out.push({ row, approvalContext: context });
  }
  return out;
}

/** FR-7: a removal and its addremovalreason on the same target become one row. */
function combineRemovalReasons(rows: RenderRow[]): RenderRow[] {
  const byTarget = new Map<string, RenderRow[]>();
  for (const r of rows) {
    const key = bareContentId(r.row.permalink) ?? r.row.id;
    const group = byTarget.get(key);
    if (group) group.push(r);
    else byTarget.set(key, [r]);
  }

  const combined: RenderRow[] = [];
  for (const group of byTarget.values()) {
    let removal: RenderRow | undefined;
    let reason: RenderRow | undefined;
    const others: RenderRow[] = [];
    for (const r of group) {
      if (REMOVAL_ACTIONS.includes(r.row.action) && !removal) removal = r;
      else if (REASON_ACTIONS.includes(r.row.action) && !reason) reason = r;
      else others.push(r);
    }
    if (removal && reason) {
      if (reason.row.reason) removal.combinedReason = reason.row.reason;
      combined.push(removal);
    } else {
      if (removal) combined.push(removal);
      if (reason) combined.push(reason);
    }
    combined.push(...others);
  }
  return combined;
}

const utf8Bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

/**
 * build_wiki_content. `rows` must be ordered newest first, as the Python query
 * (ORDER BY created_at DESC) returns them.
 */
export function buildWikiContent(rows: StoredAction[], opts: RenderOptions): RenderResult {
  const header = `**Last Updated:** ${formatUtcDate(opts.now)} ${formatUtcTime(opts.now)} UTC\n\n---\n\n`;
  if (rows.length === 0) {
    return { content: `${header}No recent moderation actions found.`, rows: 0, trimmedDays: 0 };
  }

  let actions = combineRemovalReasons(gateApprovals(rows, opts));
  if (actions.length > MAX_WIKI_ENTRIES) actions = actions.slice(0, MAX_WIKI_ENTRIES);

  const byDate = new Map<string, RenderRow[]>();
  for (const r of actions) {
    const date = formatUtcDate(rowDate(r.row));
    const group = byDate.get(date);
    if (group) group.push(r);
    else byDate.set(date, [r]);
  }
  const dates = [...byDate.keys()].sort().reverse();

  const blocks = dates.map((date) => {
    const lines = [`## ${date}`, '| Time | Action | ID | Moderator | Content | Reason | Inquire |', '|------|--------|----|-----------|---------|--------|---------|'];
    const dayRows = [...(byDate.get(date) ?? [])].sort((a, b) => b.row.createdAt - a.row.createdAt);
    for (const r of dayRows) lines.push(formatEntry(r, opts));
    lines.push('');
    return lines.join('\n');
  });

  const parts = [header];
  let size = utf8Bytes(header + FOOTER_LINES.join('\n'));
  let trimmedDays = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as string;
    const next = size + utf8Bytes(block);
    if (next > TRIM_THRESHOLD) {
      trimmedDays = dates.length - i;
      if (trimmedDays > 0) {
        parts.push(`\n**Note:** ${trimmedDays} older day(s) trimmed due to wiki size limits.`);
        parts.push(`Only showing entries from ${i > 0 ? dates[i - 1] : 'today'} onwards.\n`);
      }
      break;
    }
    parts.push(block);
    size = next;
  }
  parts.push(...FOOTER_LINES);

  const content = parts.join('\n');
  if (utf8Bytes(content) > REDDIT_WIKI_LIMIT) {
    throw new Error(`Wiki content too large: ${utf8Bytes(content)} bytes (limit ${REDDIT_WIKI_LIMIT})`);
  }
  return { content, rows: actions.length, trimmedDays };
}

/** get_content_hash: SHA-256 with the volatile "Last Updated" line removed. */
export function contentHash(content: string): string {
  const hashable = content.replace(/^\*\*Last Updated:\*\* .*\n/, '');
  return createHash('sha256').update(hashable, 'utf8').digest('hex');
}
