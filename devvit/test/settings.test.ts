import { describe, expect, it } from 'vitest';

import { DEFAULT_WIKI_ACTIONS } from '../src/core/constants.js';
import {
  loadConfig,
  parseIgnoredModerators,
  validateAnonymize,
  validateDays,
  validateIgnoredModerators,
  validateWikiActions,
  validateWikiPage,
} from '../src/core/settings.js';

describe('validators', () => {
  it('accepts normal wiki page names and rejects reserved or malformed ones', () => {
    expect(validateWikiPage('modlog')).toBeUndefined();
    expect(validateWikiPage('modlog-devvit')).toBeUndefined();
    expect(validateWikiPage('logs/mod')).toBeUndefined();
    expect(validateWikiPage('')).toBeDefined();
    expect(validateWikiPage('config/sidebar')).toBeDefined();
    expect(validateWikiPage('automoderator')).toBeDefined();
    expect(validateWikiPage('mod log')).toBeDefined();
  });

  it('bounds day counts to 1..365 whole numbers', () => {
    expect(validateDays(90)).toBeUndefined();
    expect(validateDays(0)).toBeDefined();
    expect(validateDays(366)).toBeDefined();
    expect(validateDays(1.5)).toBeDefined();
    expect(validateDays(undefined)).toBeDefined();
  });

  it('requires known, non-empty action lists', () => {
    expect(validateWikiActions([...DEFAULT_WIKI_ACTIONS])).toBeUndefined();
    expect(validateWikiActions([])).toBeDefined();
    expect(validateWikiActions(['removelink', 'nope'])).toContain('nope');
  });

  it('refuses to turn anonymization off', () => {
    expect(validateAnonymize(true)).toBeUndefined();
    expect(validateAnonymize(false)).toBeDefined();
  });

  it('parses and validates ignored moderators', () => {
    expect(parseIgnoredModerators(' AutoModerator, u/Some_Mod ,,')).toEqual(['AutoModerator', 'Some_Mod']);
    expect(validateIgnoredModerators('AutoModerator')).toBeUndefined();
    expect(validateIgnoredModerators('bad name!')).toBeDefined();
  });
});

describe('loadConfig', () => {
  it('applies defaults when nothing is set', () => {
    const cfg = loadConfig({}, 'OpenSignups');
    expect(cfg).toEqual({
      subredditName: 'OpenSignups',
      wikiPage: 'modlog-devvit',
      retentionDays: 90,
      displayDays: 90,
      wikiActions: [...DEFAULT_WIKI_ACTIONS],
      anonymizeModerators: true,
      ignoredModerators: [],
    });
  });

  it('clamps days, caps display at retention and keeps anonymization on', () => {
    const cfg = loadConfig({ retentionDays: 30, displayDays: 400, anonymizeModerators: false, wikiPage: 'ModLog' }, 'S');
    expect(cfg.retentionDays).toBe(30);
    expect(cfg.displayDays).toBe(30);
    expect(cfg.anonymizeModerators).toBe(true);
    expect(cfg.wikiPage).toBe('modlog');
  });

  it('throws on a reserved page or missing subreddit', () => {
    expect(() => loadConfig({ wikiPage: 'config/automoderator' }, 'S')).toThrow();
    expect(() => loadConfig({}, undefined)).toThrow();
  });
});
