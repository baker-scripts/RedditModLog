/**
 * Shared shapes. StoredAction mirrors one row of the Python `processed_actions`
 * table, so the renderer consumes the same data build_wiki_content saw.
 */

/** The subset of a Devvit ModAction the app reads. */
export interface ModLogEntry {
  id: string;
  type: string;
  moderatorName?: string | undefined;
  createdAt: Date;
  description?: string | undefined;
  details?: string | undefined;
  target?:
    | {
        id: string;
        author?: string | undefined;
        permalink?: string | undefined;
      }
    | undefined;
}

export interface StoredAction {
  id: string;
  action: string;
  /** "AutoModerator", "Reddit", the anonymized label, or null when the log had no moderator. */
  moderator: string | null;
  /** Absolute "https://reddit.com/..." post/comment link, or null. Never a profile link. */
  permalink: string | null;
  /** Email-censored, pipe-sanitized reason; "" when absent. */
  reason: string;
  targetAuthor: string | null;
  /** Epoch seconds. */
  createdAt: number;
}

/** Latest Reddit/AutoModerator removal of one target, used to gate approval rows (FR-8). */
export interface PriorRemoval {
  moderator: string;
  reason: string;
  createdAt: number;
}

export interface AppConfig {
  subredditName: string;
  wikiPage: string;
  retentionDays: number;
  displayDays: number;
  wikiActions: string[];
  anonymizeModerators: boolean;
  ignoredModerators: string[];
}
