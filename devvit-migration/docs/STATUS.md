# RedditModLog → Devvit: Migration Status

| Field | Value |
| --- | --- |
| Status | Supported runtime. 0.0.3 published unlisted and installed on r/OpenSignups (page `modlog-devvit`). The Python container is being retired at cutover; its wiki page was archived to `modlog-archive` first. |
| Date | 2026-10-20 |
| Branch | `feat/devvit-web` |
| App name | `autowikimod` (`devvit/devvit.json`) |
| Code root | `devvit/` (`@devvit/web` 0.14.8, Hono server, `@devvit/start` vite build to `dist/server/index.cjs`) |
| Legacy source | `modlog_wiki_publisher.py` (unchanged; the parity reference) |

## Done

| Area | State |
| --- | --- |
| Platform model | Devvit Web: `devvit.json` replaces `devvit.yaml`; all handlers are `/internal/*` routes on a Hono server; `reddit`, `redis`, `settings`, `context` come from `@devvit/web/server`. |
| Schedule | Cron task `publish-modlog`, `*/20 * * * *`. |
| `onModAction` | Dropped. Its payload has no `details`/`description` field, so it cannot carry removal-reason text, and the cron already reads the full mod log. One code path, as in Python. |
| Ingest | Up to 500 entries per run, stored oldest first; `hSetNX` on the `act` hash is the dedup gate. Entries older than retention are skipped. |
| Render | `src/core/render.ts` ports `build_wiki_content` and helpers. Byte-identical to Python on the parity fixture. |
| FR-7 | Removal plus `addremovalreason` on the same target render as one row with the reason. |
| FR-8 | Approval rows render only when they reverse a Reddit/AutoModerator removal of the same target, read from the `prior` Redis hash keyed by bare post/comment id. |
| Hash skip | SHA-256 of the page without the `Last Updated` line, per page, in the `wikihash` hash. Same as current Python `get_content_hash`. |
| Size | Oldest-day trimming at 90% of 512 KiB; refuses to grow a page already above 95%. |
| Settings | Wiki page (default `modlog-devvit`), days shown (90), days kept (90), action list (Python defaults), anonymize (on; turning it off is refused), ignored moderators (empty). Each has a validation endpoint. |
| Menu | Subreddit menu, moderators only: Publish now, Force rebuild (no fetch, forced write, like `--force-wiki`), Test connection. |
| Concurrency | `lock` hash with a 120 s stale takeover, so the cron and a menu click cannot publish at once. |
| Tests | 42 Vitest tests in 5 files: render, FR-7/FR-8 correlation, settings, Redis store (`@devvit/test` harness), publish cycle, golden parity. |
| Parity | `devvit/test/parity/golden.md` is produced by `python_render.py`, which runs the fixture through the unmodified Python functions. CI regenerates it with uv and diffs it, and the TS pipeline must equal it byte for byte. |
| CI | `.github/workflows/devvit.yml` on the org `hetzner` runner: `npm ci`, type-check, test, build, Python golden check. |

## Deliberate differences from Python

| Item | Python | Devvit | Why |
| --- | --- | --- | --- |
| FR-8 target match | `target_permalink LIKE '%<id>%'` | exact bare post/comment id | The `LIKE` also matches comments under an approved post, so a post approval could cite a comment's AutoModerator removal. |
| Reason source | `description` (reason action), else `mod_note`, else `details` | `description` (reason action), else `details` | Devvit `ModAction` has no `mod_note` field. |
| Moderator stored | real name in SQLite | anonymized label in Redis | Anonymization cannot be turned off, so the real name is never needed. |
| Ignored moderators | code default `[]`; `config_template.json` ships `["AutoModerator"]` | default empty | Matches the code default. Set `AutoModerator` in settings if the live page must match a config that ignores it. With AutoModerator ignored, approvals of AutoModerator removals have nothing to reverse and are dropped, in both apps. |
| Action list | stored but not used for the page (`show_only_removals=True`) | drives the page filter | Same output at the default list. |
| Fetch size | 50 per 10 min | 500 per 20 min | Fewer, larger runs; dedup makes overlap harmless. |

## Live run on r/OpenSignups

| Check | Result |
| --- | --- |
| Install | 0.0.3 installed 2026-10-18; first write to `modlog-devvit` at 03:20 UTC (204 rows, 500 actions). |
| Side-by-side with Python `modlog` | One overlap, 2026-10-18 03:20-03:42 UTC. Shared window from 2026-09-05: 190 of 196 rows identical. 3 differ by a since-deleted author name, and 3 by an approval reason that Python's `LIKE` match took from another target. |
| Cron | 7 revisions by `autowikimod` from 2026-10-18 to 2026-10-19; each new qualifying action is on the page. |
| FR-8 | Approvals with no prior Reddit/AutoModerator removal are left out, as in Python. |
| History | The first run reads the last 500 mod-log entries only, so the page starts at 2026-09-05. The Python page went back to 2026-07-15. |

## Production cutover (open)

1. In the r/OpenSignups app settings, set the wiki page to `modlog` and days kept to 365.
2. Run "Publish now" from the subreddit menu and check the `modlog` page revision author is `autowikimod`.
3. Keep `modlog-devvit` as an archive, or delete it.

## Needs a live playtest (items 1-4 and 7 now pass on r/OpenSignups)

Typed and unit-tested offline, but not yet run on Reddit:

1. `reddit.getModerationLog({ subredditName, limit: 500, pageSize: 100 }).all()` on r/OpenSignups, including the `targetPermalink`/`targetAuthor` values and that `addremovalreason` text arrives in `description`.
2. `getWikiPage` throwing for a missing `modlog-devvit` page, then `createWikiPage` creating it as the app account.
3. `updateWikiPage` on the second write, and wiki permissions for the app account.
4. The cron firing every 20 minutes after install, and a run finishing inside the 30 s request limit at 500 entries.
5. Settings form: defaults shown, validators rejecting bad input, multiSelect value shape.
6. Menu toasts for all three items.
7. Side-by-side diff of `wiki/modlog-devvit` against the live Python `wiki/modlog` after both have run on the same day.

## Operator steps (from `devvit/`)

1. `npm ci`
2. `npx devvit login`
3. `npx devvit upload`
4. `npx devvit install r/OpenSignups autowikimod`
5. If step 4 is refused because r/OpenSignups has 200+ subscribers, run `npx devvit publish` (unlisted review), wait for approval, then repeat step 4.
6. In r/OpenSignups, open the subreddit three-dot menu, run **Modlog: Test connection**, then **Modlog: Publish now**.
7. `npx devvit logs r/OpenSignups autowikimod --since 1h`
8. Compare `https://www.reddit.com/r/OpenSignups/wiki/modlog-devvit` with `wiki/modlog`.
9. At cutover: set **Wiki page name** to `modlog` and stop the Python container.

## Open after playtest

- Public listing (`devvit publish --public`) if other subreddits will install it.
- Remove the Python daemon and Docker image once the Devvit page has run in place of `modlog`.
- `devvit-migration/docs/01..04` describe the classic-model design. They are kept for history, and this file reflects the current design.
