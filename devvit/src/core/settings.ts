/**
 * Install settings: validators (wired to devvit.json validationEndpoint) and
 * the loader that turns raw settings into an AppConfig. Defaults and bands
 * follow CONFIG_LIMITS in modlog_wiki_publisher.py.
 */
import {
  DAYS_MAX,
  DAYS_MIN,
  DEFAULT_DISPLAY_DAYS,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_WIKI_ACTIONS,
  DEFAULT_WIKI_PAGE,
  VALID_MODLOG_ACTIONS,
} from './constants.js';
import type { AppConfig } from './types.js';

export const SETTING_KEYS = {
  wikiPage: 'wikiPage',
  retentionDays: 'retentionDays',
  displayDays: 'displayDays',
  wikiActions: 'wikiActions',
  anonymizeModerators: 'anonymizeModerators',
  ignoredModerators: 'ignoredModerators',
} as const;

/** A validator returns an error message, or undefined when the value is valid. */
export type Validator<T> = (value: T | undefined) => string | undefined;

const WIKI_PAGE_RE = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const USERNAME_RE = /^[A-Za-z0-9_-]{1,20}$/;

/** Reddit-managed pages a mistyped name could overwrite. */
const PROTECTED_PAGE_PREFIXES = ['config/', 'automoderator', 'usernotes', 'toolbox'];

export const validateWikiPage: Validator<string> = (value) => {
  const page = (value ?? '').trim().toLowerCase();
  if (!page) return 'Wiki page name is required.';
  if (page.length > 128) return 'Wiki page name must be 128 characters or fewer.';
  if (!WIKI_PAGE_RE.test(page)) return 'Use lowercase letters, digits, "_", "-" and "/" only.';
  if (PROTECTED_PAGE_PREFIXES.some((p) => page.startsWith(p))) return `"${page}" is a reserved page.`;
  return undefined;
};

export const validateDays: Validator<number> = (value) => {
  if (value === undefined || !Number.isInteger(value)) return 'Enter a whole number of days.';
  if (value < DAYS_MIN || value > DAYS_MAX) return `Days must be between ${DAYS_MIN} and ${DAYS_MAX}.`;
  return undefined;
};

export const validateWikiActions: Validator<string[]> = (value) => {
  if (!value || value.length === 0) return 'Select at least one action type.';
  const invalid = value.filter((a) => !VALID_MODLOG_ACTIONS.includes(a));
  if (invalid.length > 0) return `Unknown action types: ${invalid.join(', ')}`;
  return undefined;
};

/** The Python publisher refuses to run with anonymization off; this app refuses the setting. */
export const validateAnonymize: Validator<boolean> = (value) =>
  value === false ? 'Moderator anonymization cannot be turned off.' : undefined;

export function parseIgnoredModerators(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^\/?u\//i, ''))
    .filter((s) => s.length > 0);
}

export const validateIgnoredModerators: Validator<string> = (value) => {
  const bad = parseIgnoredModerators(value).filter((n) => !USERNAME_RE.test(n));
  return bad.length > 0 ? `Not valid usernames: ${bad.join(', ')}` : undefined;
};

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(DAYS_MAX, Math.max(DAYS_MIN, Math.trunc(n)));
}

function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) return [v];
  return undefined;
}

/**
 * Build the AppConfig. Unset values take defaults; out-of-band numbers are clamped
 * as Python's validate_config_value does. An invalid page name or action list
 * throws, because publishing to the wrong page is worse than not publishing.
 */
export function loadConfig(raw: Record<string, unknown>, subredditName: string | undefined): AppConfig {
  if (!subredditName) throw new Error('No subreddit in the request context.');

  const pageRaw = typeof raw[SETTING_KEYS.wikiPage] === 'string' ? (raw[SETTING_KEYS.wikiPage] as string) : '';
  const wikiPage = (pageRaw.trim() || DEFAULT_WIKI_PAGE).toLowerCase();
  const pageError = validateWikiPage(wikiPage);
  if (pageError) throw new Error(`Invalid wiki page setting: ${pageError}`);

  const actions = asStringArray(raw[SETTING_KEYS.wikiActions]) ?? [...DEFAULT_WIKI_ACTIONS];
  const wikiActions = actions.length > 0 ? actions : [...DEFAULT_WIKI_ACTIONS];
  const actionError = validateWikiActions(wikiActions);
  if (actionError) throw new Error(`Invalid action list setting: ${actionError}`);

  const retentionDays = asNumber(raw[SETTING_KEYS.retentionDays], DEFAULT_RETENTION_DAYS);
  const displayDays = Math.min(asNumber(raw[SETTING_KEYS.displayDays], DEFAULT_DISPLAY_DAYS), retentionDays);

  const ignoredRaw = raw[SETTING_KEYS.ignoredModerators];
  return {
    subredditName,
    wikiPage,
    retentionDays,
    displayDays,
    wikiActions,
    anonymizeModerators: true,
    ignoredModerators: parseIgnoredModerators(typeof ignoredRaw === 'string' ? ignoredRaw : undefined),
  };
}
