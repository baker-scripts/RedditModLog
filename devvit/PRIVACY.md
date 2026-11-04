# Privacy Policy: autowikimod

Effective 2026-11-03. This is a project policy, not legal advice.

autowikimod is not an official Reddit product. It runs on Reddit's Developer Platform (Devvit). This policy covers only what the app itself collects and stores. Reddit's own [Privacy Policy](https://www.reddit.com/policies/privacy-policy) and Developer Terms govern the platform. If this policy conflicts with Reddit's terms, Reddit's terms control.

## Summary

- The app copies mod-log entries to a wiki page in the subreddit that installed it.
- It keeps those entries in Reddit-hosted storage for that subreddit only, for 30 days by default.
- It sends nothing to any outside server. It has no analytics, ads, payments, or AI use.
- When a user or an admin deletes a post or comment, it blanks the stored author, link, and reason and rewrites the wiki page. Account deletion sends it no signal, so the retention period applies. See "Deleted content".

## What the app handles

For each mod-log entry it reads, the app stores:

| Data | Source | Notes |
| --- | --- | --- |
| Username of the content author | Mod log target | Shown on the wiki page as "Post by u/name" or "Comment by u/name". Stored as `null` when the log has none. |
| Link to the post or comment | Mod log target | Posts and comments only. Profile links are never stored. |
| Action type | Mod log | For example `removecomment`, `banuser`. |
| Moderator label | Mod log | Human moderators are stored as `HumanModerator`. The real name is not stored. `AutoModerator` and `Reddit` are stored by name. |
| Reason text | Mod log | Written by moderators. Email addresses become `[EMAIL]`. May contain whatever a moderator typed. |
| Time of the action | Mod log | UTC. |
| Entry ID | Mod log | Used to avoid storing an entry twice. |
| Run status | App | Time and result of the last run, last error text, a hash of the last page written, and a short run lock. |

Entries by moderators on your "Ignored moderators" list are not stored.

The app does not read post or comment bodies, titles, private messages, IP addresses, or email addresses of users. It does not profile, track, or sell data about anyone.

## Where it goes

1. App storage. Reddit's Devvit Redis, separate for each installation. Only the app for that subreddit can read it. The developers have no dashboard or export of it.
2. The wiki page. The app writes the log to the wiki page named in settings. Visibility of that page is set by the subreddit's moderators in the wiki settings. Anyone allowed to read the page can see the usernames and reasons on it. Each modmail link on the page contains the author's username, the action type, a short content ID, and the content link.
3. Wiki revision history. Reddit keeps earlier versions of a wiki page. Older rows that are no longer on the current page can remain in the revision history. The app cannot edit or delete revisions. Moderators can manage them in Reddit's wiki tools, and Reddit's own policies apply to them.

The app calls no service other than Reddit's.

## Retention

- Stored entries are deleted when they are older than "Days of history kept". Default 30 days, allowed 1 to 365. The check runs after every publish cycle, which is every 20 minutes.
- Rows leave the wiki page when they pass "Days shown" (default 30, never more than the retention days) or when the page is trimmed for size.
- Run status values are overwritten on each run and are not deleted on a schedule.
- The wiki page itself is not deleted by the app.

## Deleted content

- Post or comment deleted by its author or an admin: the app receives Reddit's delete event and blanks the author's username, the content link, and the reason text on every stored entry for that item. It then rewrites the wiki page. The action type, moderator label, and time remain. An entry for a removal by a moderator is kept, because that is a mod action and not a deletion.
- Author account deleted: Reddit sends the app no event for this. Entries are not scrubbed early. They are deleted when the retention period ends (default 30 days).
- Wiki revision history: the app cannot edit or delete revisions of the wiki page. Text it wrote before a scrub, including a deleted author's username, may remain in the page's revision history. Reddit's policies apply to that history, and moderators can manage it in Reddit's wiki tools.

## Uninstall and removal

- Uninstalling the app stops all collection.
- Whether Reddit deletes the stored entries at uninstall is set by Reddit's platform, not by this app. [unverified: not confirmed in Reddit's documentation as of 2026-11-03.] To remove stored entries before or after uninstalling, lower "Days of history kept" to 1 and run **Modlog: Publish now** so storage is pruned, or ask us to help.
- The wiki page stays after uninstall. Moderators must delete or blank it, and may need to review its revision history.
- To ask for removal of a specific user's data, open an issue at <https://github.com/baker-scripts/RedditModLog/issues> (do not include private details) or ask the subreddit's moderators, who control the install.

## Who is responsible

The moderators who install the app choose its settings and what the wiki page shows. They decide who can read it. This project provides the software only.

## Children

Reddit requires users to be at least 13. The app handles only data Reddit already holds about users of the installing subreddit and does not target anyone.

## Changes

Changes are made in this file and recorded in the repository history at <https://github.com/baker-scripts/RedditModLog>.

## Contact

<https://github.com/baker-scripts/RedditModLog/issues>
