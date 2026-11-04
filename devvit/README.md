# autowikimod

Not an official Reddit product. Not affiliated with or endorsed by Reddit, Inc.

autowikimod copies your subreddit's moderation log to a wiki page, one table per day. Each row has a "Contact Mods" link that opens a prefilled modmail, so a user can ask about a removal without retyping the details. It is for moderators who want a public or mod-only audit trail that Reddit's own mod log page does not give them. It is free and open source and runs on Reddit's servers (Devvit). It uses no outside server, account, or payment.

Before installing, note the following.

- The wiki page shows the author's username for each action ("Post by u/name") and the moderator's reason text. Set the wiki page's permission to what you want visible, in the subreddit's wiki settings, before the first run.
- Human moderators are always shown as `HumanModerator`. This cannot be turned off. `AutoModerator` and `Reddit` are shown by name.
- The app stores rows for up to the retention period you set (default 90 days). A deleted post, comment, or account is not yet scrubbed from the app's storage or the wiki page. See [Deleted content](#deleted-content). Until that is fixed, use the shortest retention that works for you.
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
| Days shown on the wiki page | 90 | 1 to 365. Never more than the retention days. |
| Days of history kept | 90 | 1 to 365. Older entries are deleted from app storage each run. |
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

The app does not yet remove a stored row when its post, comment, or account is deleted. The author's username, the post or comment link, and the reason text stay in app storage and on the wiki page until the retention period ends. Reddit's Devvit Rules require removal on deletion. This is a known gap. If you need an entry removed sooner, lower "Days of history kept" and run **Modlog: Force rebuild**, or edit the wiki page, or contact us.

## Privacy and terms

- [Privacy Policy](PRIVACY.md)
- [Terms of Use](TERMS.md)

## Support

Report problems or ask for data removal at <https://github.com/baker-scripts/RedditModLog/issues>. Do not post private information there. For a removal request that must stay private, say so in the issue and ask for a private channel.

To report an app that breaks Reddit's rules, use Reddit's own report flow.

## Changelog

- 0.0.0: first Devvit Web version. Cron publish, three menu items, six settings.

## License

[GPL-3.0](../LICENSE). Source: <https://github.com/baker-scripts/RedditModLog>. Developer documentation: [DEVELOPING.md](DEVELOPING.md).
