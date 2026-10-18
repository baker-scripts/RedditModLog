/**
 * ModLogEntry -> StoredAction, ported from store_processed_action,
 * get_moderator_name and get_target_permalink in modlog_wiki_publisher.py.
 */
import { ANON_LABEL } from './constants.js';
import type { ModLogEntry, StoredAction } from './types.js';

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

export function censorEmails(text: string): string {
  return text.replace(EMAIL_RE, '[EMAIL]');
}

/** sanitize_for_markdown: pipes become spaces so a reason cannot break the table. */
export function sanitizeForMarkdown(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  return String(text).replaceAll('|', ' ');
}

/** get_moderator_name(action, anonymize). AutoModerator and Reddit always stay literal. */
export function moderatorLabel(name: string | null | undefined, anonymize: boolean): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower === 'automoderator') return 'AutoModerator';
  if (lower === 'reddit') return 'Reddit';
  return anonymize ? ANON_LABEL : name;
}

/** Only post/comment links are kept; a /u/ profile link is never stored. */
export function storedPermalink(permalink: string | undefined): string | null {
  if (!permalink || !permalink.includes('/comments/') || permalink.includes('/u/')) return null;
  return permalink.startsWith('http') ? permalink : `https://reddit.com${permalink}`;
}

/**
 * Python reads addremovalreason text from `description`, otherwise `mod_note`, then `details`.
 * Devvit's ModAction has no mod_note field, so non-reason actions use `details`.
 */
export function extractReason(entry: ModLogEntry): string {
  let reason: string | null = null;
  if (entry.type === 'addremovalreason' && entry.description) {
    reason = censorEmails(entry.description.trim());
  } else if (entry.details) {
    reason = censorEmails(entry.details.trim());
  }
  return sanitizeForMarkdown(reason);
}

/** The moderator is stored already anonymized; the raw name never reaches Redis. */
export function toStoredAction(entry: ModLogEntry, anonymize: boolean): StoredAction {
  return {
    id: entry.id,
    action: entry.type,
    moderator: moderatorLabel(entry.moderatorName, anonymize),
    permalink: storedPermalink(entry.target?.permalink),
    reason: extractReason(entry),
    targetAuthor: entry.target?.author ? entry.target.author : null,
    createdAt: Math.floor(entry.createdAt.getTime() / 1000),
  };
}

export function isIgnoredModerator(name: string | undefined, ignored: readonly string[]): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return ignored.some((m) => m.toLowerCase() === lower);
}
