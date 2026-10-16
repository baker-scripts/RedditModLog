# autowikimod (RedditModLog on Devvit Web)

Reddit Developer Platform port of [`../modlog_wiki_publisher.py`](../modlog_wiki_publisher.py).
Each install reads its subreddit's moderation log every 20 minutes and writes it
to a wiki page as daily markdown tables with a prefilled modmail inquiry link per
row. Reddit hosts and authenticates it: no bot password, no daemon, no SQLite.

## Layout

| Path | Purpose |
| --- | --- |
| `devvit.json` | App manifest: server bundle, Redis + Reddit permissions, cron task, menu items, settings |
| `src/server/index.ts` | Hono server: `/internal/cron/*`, `/internal/menu/*`, `/internal/settings/*` |
| `src/server/reddit.ts` | Mod log and wiki calls through `reddit` from `@devvit/web/server` |
| `src/core/record.ts` | Mod-log entry to stored row (Python `store_processed_action`) |
| `src/core/render.ts` | Page renderer (Python `build_wiki_content`), FR-7 merging, FR-8 approval gating |
| `src/core/store.ts` | Redis layout (hashes and sorted sets only) |
| `src/core/publish.ts` | One cycle: ingest, render, hash-skip, size guard, write, prune |
| `src/core/settings.ts` | Setting validators and config loader |
| `test/` | Vitest + `@devvit/test`; `test/parity/` holds the Python golden comparison |

## Behaviour

- Cron `*/20 * * * *` fetches up to 500 mod-log entries, stores new ones, rebuilds the page from storage and writes it only when the content hash (minus the timestamp line) changed.
- Rows match the Python output: human moderators show as `HumanModerator`, AutoModerator removals show as `filter-<action>`, links point only at posts and comments, emails in reasons become `[EMAIL]`, pipes become spaces.
- FR-7: a removal and its `addremovalreason` on the same target render as one row carrying the reason.
- FR-8: an approval is shown only when it reverses a Reddit or AutoModerator removal of the same post or comment. The latest such removal per target is kept in the `prior` Redis hash.
- Pages are trimmed oldest day first at 90% of Reddit's 512 KiB limit.

## Settings (per subreddit)

| Setting | Default | Notes |
| --- | --- | --- |
| Wiki page name | `modlog-devvit` | `config/*`, `automoderator`, `usernotes`, `toolbox` are refused |
| Days shown on the wiki page | 90 | 1-365, capped at days kept |
| Days of history kept | 90 | 1-365 |
| Actions shown on the wiki page | removals, spam, `addremovalreason`, approvals | Python `DEFAULT_WIKI_ACTIONS` |
| Anonymize moderators | on | Cannot be turned off, as in the Python app |
| Ignored moderators | empty | Comma-separated; their actions are never stored |

## Menu (subreddit menu, moderators only)

- **Modlog: Publish now**: same as one cron run.
- **Modlog: Force rebuild**: rewrite the page from storage without fetching (Python `--force-wiki`).
- **Modlog: Test connection**: checks settings, mod-log read, wiki page and storage, shown in a toast.

## Develop

```bash
npm ci
npm run type-check
npm test
npm run build
```

Regenerate the Python golden after changing the fixture or the Python renderer:

```bash
uv run --no-project --python 3.13 --with praw==8.0.3 \
  python -I test/parity/python_render.py test/parity/fixture.json .. > test/parity/golden.md
```
