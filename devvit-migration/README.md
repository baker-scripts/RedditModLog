# RedditModLog → Devvit Migration

Re-platforming the Python/PRAW **Reddit Modlog Wiki Publisher** into a **Devvit** app that runs on Reddit's Developer Platform — no self-hosted daemon, no bot-password credential, no SQLite. The published wiki output and its transparency/privacy guarantees stay recognizably identical.

**Feasibility: confirmed.** Devvit provides every primitive the bot needs:

| Python (PRAW) | Devvit equivalent |
| --- | --- |
| `subreddit.mod.log(limit=N)` | `reddit.getModerationLog({ subredditName, type?, limit })` |
| `subreddit.wiki[page].edit()` | `reddit.getWikiPage` / `reddit.updateWikiPage` (512 KB cap unchanged) |
| SQLite dedup + retention + hash-cache | `redis` from `@devvit/web/server` (hashes for rows, dedup and hash cache; sorted sets by timestamp for retention) |
| Continuous daemon (`update_interval`) | `devvit.json` scheduler task, cron `*/20 * * * *` |
| `config.json` / env / CLI (19 options) | Devvit app + per-install settings (`anonymize_moderators` hardcoded true) |
| Docker / s6 / systemd | Reddit-hosted (serverless, free); publish via app review |

## Layout

- [`docs/01-requirements.md`](docs/01-requirements.md) — product requirements, feature-parity matrix (MoSCoW), risk register, MVP acceptance criteria
- [`docs/02-research-api-shapes.md`](docs/02-research-api-shapes.md) — exact Devvit Reddit-API signatures (`getModerationLog`, `ModAction`, wiki) with Python→Devvit field mapping
- [`docs/03-research-platform.md`](docs/03-research-platform.md) — Redis data model, scheduler/trigger, settings, webview/UI, publishing & limits
- [`docs/04-architecture.md`](docs/04-architecture.md) — module layout, Redis key schema, execution model, settings schema, phased plan, gap list
- [`docs/STATUS.md`](docs/STATUS.md) — what is scaffolded vs. TODO, mapped to the parity matrix
- [`docs/reddit-api/`](docs/reddit-api/) — stored Devvit API reference snippets
- [`../devvit/`](../devvit/) — the Devvit Web app (`autowikimod`)

## Status

Ported to Devvit Web; type-check, tests, build and Python parity pass offline. Awaiting upload and a live run on r/OpenSignups. See [`docs/STATUS.md`](docs/STATUS.md). `docs/01..04` describe the earlier classic-model design.
