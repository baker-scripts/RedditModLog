# autowikimod

Not an official Reddit product. Not affiliated with or endorsed by Reddit, Inc.

autowikimod copies your subreddit's moderation log to a wiki page, one table per day. Each row has a "Contact Mods" link that opens a prefilled modmail, so a user can ask about a removal without retyping the details. It is for moderators who want a public or mod-only audit trail that Reddit's own mod log page does not give them. It is free and open source and runs on Reddit's servers (Devvit). It uses no outside server, account, or payment.

Before installing, note the following.

- The wiki page shows the author's username for each action ("Post by u/name") and the moderator's reason text. Set the wiki page's permission to what you want visible, in the subreddit's wiki settings, before the first run.
- Human moderators are always shown as `HumanModerator`. This cannot be turned off. `AutoModerator` and `Reddit` are shown by name.
- The app stores rows for up to the retention period you set (default 30 days). When a user or an admin deletes a post or comment, the app blanks that row's author, link, and reason and rewrites the wiki page. Account deletions are not signaled to the app, so retention is the limit there. See [Deleted content](#deleted-content).
- The app writes to one wiki page that you name. It refuses `config/*`, `automoderator`, `usernotes`, and `toolbox`. Point it at a page that holds nothing else, because each run overwrites the page.

## What it does

- Every 20 minutes it reads up to 500 recent mod-log entries, stores the new ones, and rebuilds the wiki page. It writes only when the content changed.
- A removal and its removal reason on the same item show as one row.
- An approval shows only when it reverses a removal by Reddit or AutoModerator.
- Links point at the post or comment, never at a user profile. Email addresses in reasons become `[EMAIL]`. Pipe characters become spaces so a reason cannot break the table.
- Pages stop adding older days at 90% of Reddit's 512 KiB wiki limit and say how many days were trimmed.

## Setup

1. Install the app from the Reddit app directory, on your subreddit.
2. Open the app's subreddit settings and set each option below. Every setting is per subreddit.
3. Set the wiki page's visibility in your subreddit's wiki settings.
4. Open the subreddit menu and run **Modlog: Test connection**, then **Modlog: Publish now**.

| Setting | Default | What it does |
| --- | --- | --- |
| Wiki page name | `modlog-devvit` | Page the log is written to. Lowercase letters, digits, `_`, `-`, `/`. Up to 128 characters. |
| Days shown on the wiki page | 30 | 1 to 365. Never more than the retention days. |
| Days of history kept | 30 | 1 to 365. Older entries are deleted from app storage each run. |
| Actions shown on the wiki page | removals, spam removals, removal reasons, approvals | Pick from 43 mod-log action types, such as `banuser`, `lock`, or `addnote`. At least one is required. |
| Anonymize moderators | on | Human moderators show as `HumanModerator`. Cannot be turned off. |
| Ignored moderators | empty | Comma-separated usernames. Their actions are never stored. |

Entries older than the retention days are skipped when read. The app only keeps and shows actions of the types you select, but it stores every non-ignored entry it reads.

## Moderator menu

The subreddit menu shows these items to moderators only.

- **Modlog: Publish now** runs one cycle immediately.
- **Modlog: Force rebuild** rewrites the page from stored entries without reading the log.
- **Modlog: Test connection** checks settings, mod-log access, the wiki page, and storage, then shows the result as a toast.

If a cycle is already running, the menu tells you to try again in a minute.

## Permissions

| Permission | Why |
| --- | --- |
| Reddit API (`reddit`) | Read the moderation log and read and write the one wiki page you name. |
| Redis (`redis`) | Keep the stored rows between runs, in Reddit-hosted storage for your install only. |

The app does not use HTTP fetch, payments, or any LLM. It sends no data off Reddit.

## Deleted content

Reddit's Devvit Rules do not allow keeping deleted content, even anonymized. The app handles this in two ways.

- Post or comment deleted by its author or an admin: the app receives Reddit's delete event, blanks the author, link, and reason on every stored row for that item, and rewrites the wiki page. A removal by a moderator is a mod action, not a deletion, and its row stays.
- Account deleted: Reddit sends the app no event for this, so rows are not scrubbed early. The retention period (default 30 days) is the limit. Lower "Days of history kept" for a shorter limit.

Reddit keeps earlier versions of a wiki page in its revision history. The app cannot edit or delete revisions, so text it wrote before a scrub can remain there. Moderators can manage revisions in Reddit's wiki tools.

## Privacy and terms

- [Privacy Policy](PRIVACY.md)
- [Terms of Use](TERMS.md)

## Support

Report problems or ask for data removal at <https://github.com/baker-scripts/RedditModLog/issues>. Do not post private information there. For a removal request that must stay private, say so in the issue and ask for a private channel.

To report an app that breaks Reddit's rules, use Reddit's own report flow.

## Changelog

- Unreleased: scrub author, link, and reason from stored rows and the wiki page when a user or admin deletes a post or comment. Default days kept and days shown are now 30. The package license is now GPL-3.0-only, matching the repository.
- 0.0.0: first Devvit Web version. Cron publish, three menu items, six settings.

## License

[GPL-3.0](../LICENSE). Source: <https://github.com/baker-scripts/RedditModLog>. Developer documentation: [DEVELOPING.md](DEVELOPING.md).
