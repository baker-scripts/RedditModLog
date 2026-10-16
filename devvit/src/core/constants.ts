/**
 * Constants ported from modlog_wiki_publisher.py (action sets, limits, wiki cap).
 * No platform imports, so the pure render layer can be unit-tested anywhere.
 */

export const REMOVAL_ACTIONS: readonly string[] = ['removelink', 'removecomment', 'spamlink', 'spamcomment'];
export const APPROVAL_ACTIONS: readonly string[] = ['approvelink', 'approvecomment'];
export const REASON_ACTIONS: readonly string[] = ['addremovalreason'];
export const DEFAULT_WIKI_ACTIONS: readonly string[] = [...REMOVAL_ACTIONS, ...REASON_ACTIONS, ...APPROVAL_ACTIONS];

/** Python VALID_MODLOG_ACTIONS; the settings multiSelect offers exactly these. */
export const VALID_MODLOG_ACTIONS: readonly string[] = [
  'removelink',
  'removecomment',
  'spamlink',
  'spamcomment',
  'approvelink',
  'approvecomment',
  'addremovalreason',
  'addnote',
  'deletenote',
  'banuser',
  'unbanuser',
  'muteuser',
  'unmuteuser',
  'invitemoderator',
  'acceptmoderatorinvite',
  'distinguish',
  'undistinguish',
  'sticky',
  'unsticky',
  'lock',
  'unlock',
  'marknsfw',
  'unmarknsfw',
  'wikirevise',
  'wikipagelisted',
  'wikipermlevel',
  'wikibanned',
  'wikicontributor',
  'editsettings',
  'editflair',
  'createrule',
  'editrule',
  'deleterule',
  'reorderrules',
  'ignorereports',
  'unignorereports',
  'request_assistance',
  'community_widgets',
  'community_welcome_page',
  'edit_post_requirements',
  'edit_comment_requirements',
  'edit_saved_response',
  'addtocollection',
  'removefromcollection',
];

export const ANON_LABEL = 'HumanModerator';

export const DAYS_MIN = 1;
export const DAYS_MAX = 365;
export const DEFAULT_RETENTION_DAYS = 90;
export const DEFAULT_DISPLAY_DAYS = 90;
export const DEFAULT_WIKI_PAGE = 'modlog-devvit';

/** Python max_wiki_entries_per_page default. */
export const MAX_WIKI_ENTRIES = 1000;

/** Mod-log entries fetched per run (Python batch_size max). Paging stops at the first already-stored id. */
export const FETCH_LIMIT = 500;
export const FETCH_PAGE_SIZE = 100;

/** Reddit wiki page size limit in UTF-8 bytes (512 KiB). */
export const REDDIT_WIKI_LIMIT = 524288;
/** Day blocks are dropped once content would pass 90% of the limit. */
export const TRIM_THRESHOLD = Math.floor(REDDIT_WIKI_LIMIT * 0.9);
/** Write guard: refuse to grow a page already above 95% of the limit. */
export const WRITE_WARNING_THRESHOLD = Math.floor(REDDIT_WIKI_LIMIT * 0.95);

export const WIKI_EDIT_REASON = 'Automated modlog update';
