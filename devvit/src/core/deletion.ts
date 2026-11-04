/**
 * Devvit Rules: deleted content must not be retained, even anonymized. A post or
 * comment deleted by its author or an admin has its author, link and reason
 * blanked in storage. A moderator removal is a mod action, not a deletion.
 */
import type { Store } from './store.js';

export type DeletionSource = number | string | undefined;

/** EventSource arrives as an enum number or name. MODERATOR is the only source that keeps rows. */
export function shouldScrub(source: DeletionSource): boolean {
  return source !== 3 && source !== 'MODERATOR';
}

/** "t3_abc", "t1_abc" or "abc" to "abc"; null for an empty id. */
export function bareId(id: string | undefined): string | null {
  const bare = (id ?? '').replace(/^t[13]_/, '');
  return bare === '' ? null : bare;
}

/** Scrub stored rows for a deleted target. Returns rows changed (0 when ignored). */
export async function scrubDeleted(store: Store, rawId: string | undefined, source: DeletionSource): Promise<number> {
  const id = bareId(rawId);
  if (!id || !shouldScrub(source) || !/^[a-z0-9]+$/i.test(id)) return 0;
  return store.scrubTarget(id);
}
