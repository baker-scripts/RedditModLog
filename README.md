# Reddit Modlog Wiki Publisher

[![Docker Build](https://github.com/baker-scripts/RedditModLog/actions/workflows/docker-build.yml/badge.svg)](https://github.com/baker-scripts/RedditModLog/actions/workflows/docker-build.yml)
[![Pre-commit](https://github.com/baker-scripts/RedditModLog/actions/workflows/pre-commit.yml/badge.svg)](https://github.com/baker-scripts/RedditModLog/actions/workflows/pre-commit.yml)
[![Devvit app](https://github.com/baker-scripts/RedditModLog/actions/workflows/devvit.yml/badge.svg)](https://github.com/baker-scripts/RedditModLog/actions/workflows/devvit.yml)
[![Release](https://img.shields.io/github/v/release/baker-scripts/RedditModLog)](https://github.com/baker-scripts/RedditModLog/releases)

Publishes a subreddit's moderation log to a wiki page as daily markdown tables. Each row links to the post or comment (never a user profile), shows the removal reason text, and carries a prefilled modmail inquiry link. A SQLite database handles deduplication and retention, and one database can serve several subreddits.

> **Deprecated.** The supported runtime is now the Reddit-hosted [Devvit](https://developers.reddit.com/) app `autowikimod` in [`devvit/`](devvit/). It needs no self-hosting, no bot password and no SQLite. Install it from the Devvit app directory and set the wiki page in the app's subreddit settings. The Python bot documented below gets no new features and only critical fixes. It depends on password-grant Data API access, which Reddit is closing for unregistered scripts. See [`devvit/README.md`](devvit/README.md) and [`devvit-migration/docs/STATUS.md`](devvit-migration/docs/STATUS.md).

## Quick start (Docker)

The bot account needs moderator access to the subreddit, including wiki edit permission. Create a Reddit app of type "script" at <https://www.reddit.com/prefs/apps> to get a client ID and secret.

```bash
mkdir -p ./config/data ./config/logs
cp config_template.json ./config/config.json   # edit credentials and source_subreddit
docker run -d --name reddit-modlog \
  -e PUID=1000 -e PGID=1000 \
  -v ./config:/config \
  ghcr.io/baker-scripts/redditmodlog:1
```

The container runs `modlog_wiki_publisher.py --config /config/config.json --continuous`. With no `/config/config.json`, it starts from environment variables alone and exits if `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`, or `SOURCE_SUBREDDIT` is unset.

Compose, one service per subreddit:

```yaml
services:
  redditmodlog-example:
    image: ghcr.io/baker-scripts/redditmodlog:1
    restart: unless-stopped
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./example:/config
    mem_limit: 256m
    cpus: 0.5
```

The repo's [`docker-compose.yml`](docker-compose.yml) configures a single instance from environment variables and mounts `./data` and `./logs`.

`/config` holds `config.json` (rewritten with new defaults on upgrade, with a `.backup` copy), `data/modlog.db`, and `logs/`.

## Quick start (Python)

```bash
pip install -r requirements.txt   # praw>=8.0.3
cp config_template.json config.json
python modlog_wiki_publisher.py --test                 # check config and Reddit API access
python modlog_wiki_publisher.py                        # run once
python modlog_wiki_publisher.py --continuous           # run as a daemon
```

## Configuration

Precedence: CLI arguments, then environment variables, then the JSON config file. Out-of-range values are clamped to the limit with a warning. `python modlog_wiki_publisher.py --show-config-limits` prints the limits.

Reddit credentials live under a `reddit` object in `config.json` (`client_id`, `client_secret`, `username`, `password`).

| Config key | CLI flag | Env var | Default | Range |
| --- | --- | --- | --- | --- |
| `source_subreddit` | `--source-subreddit` | `SOURCE_SUBREDDIT` | required | |
| `wiki_page` | `--wiki-page` | `WIKI_PAGE` | `modlog` | |
| `retention_days` | `--retention-days` | `RETENTION_DAYS` | 90 | 1-365 |
| `batch_size` | `--batch-size` | `BATCH_SIZE` | 50 | 10-500 |
| `update_interval` | `--interval` | `UPDATE_INTERVAL` | 600 | 60-3600 |
| `anonymize_moderators` | | `ANONYMIZE_MODERATORS` | `true` | must be `true` |
| `wiki_actions` | | `WIKI_ACTIONS` (comma-separated) | removal, spam, `addremovalreason`, and approval actions | |
| `ignored_moderators` | | `IGNORED_MODERATORS` (comma-separated) | none in code; the template ships `["AutoModerator"]` | |
| `max_wiki_entries_per_page` | | | 1000 | 100-2000 |
| `max_continuous_errors` | | | 5 | 1-50 |
| `rate_limit_buffer` | | | 60 | 30-300 |
| `max_batch_retries` | | | 3 | 1-10 |
| `archive_threshold_days` | | | 7 | 1-30 |
| | | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` | | |
| | | `DATABASE_PATH` | `modlog.db` (`/config/data/modlog.db` in Docker) | |
| | | `LOGS_DIR` | `logs` (`/config/logs` in Docker); created at startup | |
| | | `PUID`, `PGID` (Docker only) | 1000 | |

The app refuses to start when `anonymize_moderators` is `false`: moderator names are replaced with `AutoModerator` or `HumanModerator`. The `database_path` and `display_format` keys in `config_template.json` are not read by the code; use `DATABASE_PATH`.

`docker-compose.yml` sets its own defaults for `RETENTION_DAYS` (30), `BATCH_SIZE` (100), and `UPDATE_INTERVAL` (300).

## Usage

```text
python modlog_wiki_publisher.py [options]
  --config FILE            config file (default: config.json)
  --source-subreddit NAME
  --wiki-page NAME
  --retention-days N
  --batch-size N
  --interval N             seconds between updates in daemon mode
  --continuous             run until stopped
  --test                   test config and Reddit API access, then exit
  --debug                  verbose logging
  --show-config-limits     print limits and defaults
  --force-migrate          force database migration
  --no-auto-update-config  do not rewrite the config file with new defaults
  --force-modlog           fetch all modlog actions from Reddit and rebuild the wiki
  --force-wiki             rewrite the wiki even if the content hash is unchanged
  --force-all              --force-modlog plus --force-wiki
```

Use `--force-wiki` after a format change and `--force-modlog` to rebuild from scratch.

Info logs go to stdout and warnings to stderr. The database migrates to the current schema on startup.

Sample database queries:

```bash
sqlite3 modlog.db "SELECT action_id, action_type, moderator, removal_reason, subreddit, created_at FROM processed_actions ORDER BY created_at DESC LIMIT 10;"
sqlite3 modlog.db "DELETE FROM processed_actions WHERE created_at < strftime('%s','now','-30 days');"
```

### Wiki output

```markdown
## 2025-08-09

| Time | Action | ID | Moderator | Content | Reason | Inquire |
|------|--------|----|-----------|---------|--------|---------|
| 08:15:42 UTC | removecomment | n7ravg2 | AutoModerator | [Comment by u/user123](https://www.reddit.com/r/example/comments/1ab2cd3/title/n7ravg2/) | Rule text | [Contact Mods](https://www.reddit.com/message/compose?to=/r/example&subject=Comment%20Removal%20Inquiry...) |
```

Comments show comment IDs and posts show post IDs. Pipe characters in reasons are replaced with spaces so tables render.

## Docker image

`ghcr.io/baker-scripts/redditmodlog`, built for `linux/amd64` and `linux/arm64` on a tag push.

| Tag | Tracks |
| --- | --- |
| `1` | Latest 1.x release (recommended) |
| `1.6` | Patch releases of 1.6 |
| `1.6.2` | Pinned release |
| `latest` | Latest build of `main` |
| `sha-<commit>` | One commit |

The image uses s6-overlay v3, applies `PUID`/`PGID` to the `modlogbot` user, and has a healthcheck that tests for the database file.

## Systemd

[`systemd/`](systemd/) provides a template unit for several subreddits. The unit expects the repo at `/opt/RedditModLog` and a virtualenv at `/opt/.venv/redditbot`.

```bash
cd systemd && sudo ./install.sh
sudo cp /etc/redditmodlog/usenet.json.example /etc/redditmodlog/<subreddit>.json   # edit credentials and subreddit
sudo systemctl enable --now modlog@<subreddit>
tail -f /var/log/redditmodlog/<subreddit>.log
```

`install.sh` creates the `modlogbot` user, `/etc/redditmodlog`, `/var/log/redditmodlog`, `/opt/RedditModLog/data`, and a daily logrotate rule (30 files, 100 MB max). Per-instance credentials can go in `/etc/redditmodlog/<subreddit>.env`. The unit sets `ProtectSystem=strict` and allows writes only to `/opt/RedditModLog/data` and `/var/log/redditmodlog`, so set `DATABASE_PATH=/opt/RedditModLog/data/modlog.db` and `LOGS_DIR=/var/log/redditmodlog` in that env file. Limits: 256 MB memory and 25% CPU.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Auth failed | Check credentials; for 2FA accounts use an app password |
| Wiki edit denied | Give the bot wiki edit permission on the subreddit |
| Rate limiting | Raise `--interval` and lower `--batch-size` |
| Database grows | Lower `--retention-days` |

## Contributing

Issues and pull requests welcome. See the [contributing guidelines](https://github.com/baker-scripts/.github/blob/main/CONTRIBUTING.md) and [open an issue](https://github.com/baker-scripts/RedditModLog/issues) to discuss larger changes. Include test runs and changes to CLI help output.

## Disclaimer

Provided as-is with no warranty. Review the bot's Reddit credentials and permissions before deployment. Not affiliated with or endorsed by Reddit.

## License

[GPL-3.0](LICENSE)
