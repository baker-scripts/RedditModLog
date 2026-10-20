# RedditModLog

Automated Reddit moderation log publisher — writes mod actions to a subreddit wiki page on a schedule.

The supported runtime is the Devvit Web app `autowikimod` in `devvit/` (TypeScript, Redis, cron). The Python bot below is deprecated: critical fixes only, no new features. `modlog_wiki_publisher.py` stays as the parity reference for `devvit/test/parity/`, so do not delete it.

## Stack (deprecated Python bot)
- Python 3.11 / PRAW (Reddit API)
- SQLite (deduplication and retention)
- Docker with s6-overlay (deployment)

## Dev
```bash
/opt/.venv/redditbot/bin/python modlog_wiki_publisher.py --test
/opt/.venv/redditbot/bin/python modlog_wiki_publisher.py --source-subreddit NAME --continuous
```

Always use `/opt/.venv/redditbot/bin/python`, not system python.

## Structure
- `modlog_wiki_publisher.py` — Single-file application (ModlogDatabase class + main logic)
- `config_template.json` — Config template
- `scripts/debug_auth.py` — Auth debugging utility
- `tests/` — Test suite

## Config Priority
CLI args > Environment variables > JSON config file

## Key Environment Variables
`REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`, `SOURCE_SUBREDDIT`

## Security
- `anonymize_moderators` MUST be `true` (enforced, app refuses to start otherwise)
- Content links must never point to user profiles — only to posts/comments
- Escape pipe characters in removal reasons for markdown table compatibility

## Docker
Image: `ghcr.io/baker-scripts/redditmodlog`
Tags: `:1`, `:1.4`, `:1.4.x`, `:latest`
Uses s6-overlay for init, PUID/PGID user management.

## Git Workflow
- Conventional commits
- May commit/push directly if branch is not main and PR is draft or not open
