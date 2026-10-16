/** Production RedditPort backed by the Devvit Reddit client. */
import { reddit } from '@devvit/web/server';

import { FETCH_PAGE_SIZE, WIKI_EDIT_REASON } from '../core/constants.js';
import type { RedditPort } from '../core/publish.js';
import type { ModLogEntry } from '../core/types.js';

export const devvitReddit: RedditPort = {
  async fetchModLog(subredditName: string, limit: number): Promise<ModLogEntry[]> {
    return reddit.getModerationLog({ subredditName, limit, pageSize: FETCH_PAGE_SIZE }).all();
  },

  async readWiki(subredditName: string, page: string): Promise<string | null> {
    try {
      const wiki = await reddit.getWikiPage(subredditName, page);
      return wiki.content;
    } catch (err) {
      // A missing page throws; any other read failure surfaces again on write.
      console.log(`wiki read r/${subredditName}/wiki/${page} failed, treating as absent: ${String(err)}`);
      return null;
    }
  },

  async writeWiki(subredditName: string, page: string, content: string, exists: boolean): Promise<void> {
    const options = { subredditName, page, content, reason: WIKI_EDIT_REASON };
    if (exists) {
      await reddit.updateWikiPage(options);
      return;
    }
    try {
      await reddit.createWikiPage(options);
    } catch (err) {
      console.log(`createWikiPage failed (${String(err)}), retrying as update`);
      await reddit.updateWikiPage(options);
    }
  },
};
