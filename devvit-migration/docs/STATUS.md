# RedditModLog → Devvit: Migration Status

| Field | Value |
|---|---|
| Status | Scaffold landed as groundwork; **NOT yet MVP-parity-complete**; not playtested. Type-checks clean against `@devvit/public-api@0.13.5` (`npm run type-check` passes, `dist/` emits), but two required-scope requirements are unimplemented and the platform-model choice contradicts its own research doc (see §7). |
| Date | 2026-09-21 |
| Branch | `feat/devvit-migration` |
| Code root | `devvit/` (classic `@devvit/public-api` 0.13.5 builder model) |
| Legacy source | `modlog_wiki_publisher.py` (read-only reference) |

This document tracks what is implemented vs. outstanding, mapped to the parity
matrix and the binding invariants (INV-1..INV-9).

---

## 1. Build artifacts (this pass)

| File | State | Notes |
|---|---|---|
| `devvit/package.json` | DONE | `redditmodlog-devvit`, dep `@devvit/public-api@0.13.5`, scripts: `deploy`/`dev`/`playtest`/`login`/`launch`/`type-check`/`test`. |
| `devvit/devvit.yaml` | DONE | `name: redditmodlog`. Unique-name claim happens on first `devvit upload` — rename here first if taken. |
| `devvit/tsconfig.json` | DONE | Extends `@devvit/public-api/devvit.tsconfig.json` (module/moduleResolution = **NodeNext**). |
| `devvit/.gitignore` | DONE | `node_modules`, `dist`, `.devvit`, `.env*`. |
| `devvit/src/main.ts` | DONE | Entrypoint: `Devvit.configure` + scheduler job + triggers + settings/menu registration + the shared publish cycle. |
| `devvit/README.md` | DONE | Upload/playtest, settings table, parity/invariant matrix. |
| `devvit/src/types.ts` | DONE (NEW) | The shared contract every module imported but which did not exist — see §3. |

---

## 2. Component modules (authored separately; wired this pass)

| Module | State | Owner-of (invariants) |
|---|---|---|
| `storage.ts` | DONE + adapter layer added (§3) | INV-5, INV-6, INV-9, retention |
| `modlog.ts` | DONE (ingest/extract only — see §7b for the trigger-refetch gap) | INV-1, INV-2 (gating), INV-5, INV-7, INV-8 |
| `render.ts` | DONE for single-row rendering; **FR-7/FR-8 NOT implemented** (§7c) | INV-2 (emit), INV-3, INV-4, INV-6 (hash) |
| `wiki.ts` | DONE | INV-3 (guard), INV-6 |
| `settings.ts` | DONE | INV-1, INV-7, INV-8, INV-9 |
| `menu.ts` | DONE (signature drift fixed, §3) | — (thin adapter) |

---

## 3. Contract reconciliation performed this pass

The component modules were authored in parallel against the architecture spec,
but the spec's idealized names and `storage.ts`'s actual implementation had
**drifted**. The whole project would not have compiled or linked. The following
minimal, non-logic reconciliations were made so it builds:

1. **`types.ts` created** — `modlog.ts`, `render.ts`, and `settings.ts` all
   `import` from `./types.js`, but the file did not exist. Created it as the
   single source of truth for `ModRecord`, `AppConfig`, `ModActionType`,
   `DisplayKind`, and all constants (`WIKI_BYTE_CAP`, `WIKI_TRIM_TARGET`,
   `ANON_LABEL`, `LITERAL_MODS`, `ANONYMIZE_MODERATORS`, `DEFAULT_*`,
   `*_MIN/_MAX`, `VALID_MODLOG_ACTIONS`, `SCHEMA_VERSION`). No `@devvit/*` import
   so the pure render layer stays platform-free.

2. **Storage spec-name adapter layer** (appended to `storage.ts`) — the spec /
   sibling modules call `markSeen` / `putRecord` / `getAllRecords` /
   `getStatus` / `recordRunStarted` / `recordPublished`, but the implementation
   defined `isProcessed` / `recordAction` / `getRecentActions` and **no** status
   accessors. Added thin adapters:
   - `markSeen` = `!isProcessed` (inverse sense: returns `true` when NEW).
   - `putRecord` → `recordAction`.
   - `getAllRecords` → `getRecentActions` with a default cap.
   - `getStatus` / `recordRunStarted` / `recordPublished` → new `status` hash.
   No existing logic was rewritten.

3. **`render.ts` import extension** — `from './types'` → `from './types.js'`.
   Under the Devvit base tsconfig's **NodeNext** resolution, relative specifiers
   MUST carry the `.js` extension; the bare specifier was a compile error.

### Reconciliations performed this pass (compiler-verified)

4. **`modlog.ts` package + client threading fixed** — it imported
   `{ reddit }` and `ModAction` from `@devvit/reddit` (the split-package /
   Devvit-Web name), which does NOT exist in the classic
   `@devvit/public-api@0.13.5` model and failed with `TS2307`. The classic model
   has **no `reddit` singleton** — the Reddit client is `context.reddit`
   (`RedditAPIClient`), and `ModAction`/`ModActionType` are re-exported from
   `@devvit/public-api`. Fixed by importing types from `@devvit/public-api` and
   threading a `RedditAPIClient` argument through `fetchActions(reddit, cfg)` and
   `ingest(reddit, redis, cfg)` (mirrors `wiki.ts`). Callers updated:
   `main.ts` (`runPublishCycle` + `ModAction` trigger now destructure `reddit`
   and pass it), `menu.ts` (`handlePublishNow` passes `reddit`).

5. **`menu.ts` signature drift fixed** — it called `loadConfig()` (0 args) and
   `ingest(reddit, redis, cfg)` against a then-2-arg `ingest`. Now calls
   `loadConfig(context.settings, context.subredditName)` (with an INV-9
   no-subreddit guard) and `ingest(reddit, redis, cfg)` against the corrected
   3-arg signature.

After (4)+(5): `npm run type-check` passes with zero errors and `dist/` emits
for all 8 modules (forced clean rebuild verified). **Type-checking clean is not
the same as parity-complete or playtested — see §7.**

### Known residual drift (cosmetic — non-blocking)

- **`ModRecord` (types) vs `ModActionRecord` (storage)** are structurally
  identical, so cross-passing type-checks today. Consider collapsing to one
  named type to avoid future drift.
- **`wiki.ts` header comments** still reference the `@devvit/reddit` /
  `@devvit/redis` split packages as a Devvit-Web TODO; the actual imports
  correctly use `@devvit/public-api`. Documentation-only; harmless.

---

## 4. Parity matrix (Python → Devvit)

| Capability | Python | Devvit | State |
|---|---|---|---|
| Auth | password-grant OAuth | platform-managed | DONE (no code) |
| Mod-log fetch | `subreddit.mod.log(limit)` | `reddit.getModerationLog({limit,pageSize})` | DONE |
| Action filter (7 types) | client-side | client-side (`type` filter is single-valued) | DONE |
| Anonymize (INV-1) | enforced | hardcoded, no toggle | DONE |
| Profile-link ban (INV-2) | enforced | permalink only for t1/t3 | DONE |
| Reason censor/escape (INV-4) | regex | ported regex (`render`) | DONE |
| Markdown tables | per-day | per-day (`render.buildContent`) | DONE |
| Modmail prefill link | yes | `render.modmailLink` | DONE |
| 512 KB cap + trim (INV-3) | yes | `render.enforceByteCap` + `wiki` guard | DONE |
| Dedup (INV-5) | SQLite UNIQUE | Redis atomic NX (`markSeen`) | DONE |
| Wiki hash-skip (INV-6) | SHA-256 cache | SHA-256 cache, **behavior changed** (excludes timestamp — see §7e) | DONE, undisclosed behavior change |
| Retention (90d) | row delete | zset prune by score (`cleanupOld`) | DONE |
| Daemon loop | `update_interval` 600s | scheduler cron `*/10 * * * *` | DONE |
| Prompt-fast on action | n/a | `ModAction` trigger (ingest only) | DONE, but re-fetches full log every event (§7b) |
| Config (19 opts) | CLI/env/JSON | 6 install settings + 1 hardcoded | DONE |
| Multi-subreddit | single store | one install per sub (isolation) | DONE (by design) |
| Combined removal+reason rows (FR-7) | merged single row | not implemented | **NOT DONE** |
| Conditional approval rows (FR-8) | correlation-gated | not implemented | **NOT DONE** |
| CLI `--test` / `--force-*` | yes | menu "Publish now" (force/test variants partial) | PARTIAL |

---

## 5. FR-7 / FR-8 — verified NOT implemented

Executed the compiled pipeline against `render.ts` (`devvit/src/render.ts`) and
`modlog.ts` (`devvit/src/modlog.ts`): each `ModAction` maps 1:1 to one
`ModRecord` and one table row (`renderRow`, `render.ts:225-235`). There is no
correlation step anywhere in the pipeline that:

- **FR-7** — merges a removal action and a subsequent `addremovalreason` on the
  same content into one row (`devvit-migration/docs/01-requirements.md:102`).
- **FR-8** — suppresses an approval row unless it reverses a prior
  Reddit/AutoMod removal, or annotates it "Approved `<mod>` removal[: reason]"
  (`devvit-migration/docs/01-requirements.md:105`).

The architecture spec assigns this to `render.ts` explicitly
(`devvit-migration/docs/04-architecture.md:136`, "approval-correlation render
(P-13)") and flags the Redis-lookup design in R-3
(`devvit-migration/docs/01-requirements.md:187`, GAP-1 cross-reference). None of
that correlation/lookup code exists in `storage.ts` or `modlog.ts` either.
Previously marked DONE in error.

---

## 6. Outstanding TODO before a real deploy

1. ~~Fix `menu.ts` signature drift~~ — **DONE** (§3.4/§3.5); project type-checks
   end-to-end.
2. ~~Install deps + type-check~~ — **DONE**: `npm install` (457 pkgs) +
   `npm run type-check` pass clean against `@devvit/public-api@0.13.5`; `dist/`
   emits. The import surface and the `getModerationLog` / `getWikiPage` /
   `createWikiPage` / `updateWikiPage` / scheduler / settings call shapes are now
   compiler-validated against the installed SDK types.
3. **Implement FR-7/FR-8** (§5) — combined removal+reason rows and
   conditional approval rows. Needs the per-content secondary index design from
   R-3 before it can be built.
4. **Resolve the platform-model contradiction** (§7a) before further build —
   changes the import surface, so doing it after FR-7/FR-8 risks a second
   rewrite.
5. **Verify remaining runtime call shapes against a live install** — types
   compile, but these need playtest confirmation (behavior, not just types):
   - `reddit.getModerationLog({ subredditName, limit, pageSize })` + `.all()`
     (Listing drain — some versions use `for await` instead).
   - `reddit.getWikiPage(sub, page)` throwing on absence; `createWikiPage` /
     `updateWikiPage` option shapes (`{ subredditName, page, content, reason }`).
   - `context.scheduler.listJobs()` / `cancelJob(id)` / `runJob({name, cron})`.
   - `Devvit.addTrigger({ events: ['AppInstall','AppUpgrade'] })` and
     `event: 'ModAction'` payload fields.
   - `context.settings.get`, `context.subredditName` on scheduler/trigger ctx.
6. **Cron cadence**: confirm `*/10 * * * *` is permitted for the app tier;
   tighten/loosen as policy allows (Python used 600s).
7. **Playtest** on a test subreddit (`npm run playtest`) — exercise: install →
   settings save (validators) → menu "Publish now" → wiki page created →
   second run hash-skips → mod action triggers ingest → retention prune.
8. **Unit tests** for the pure layers (`render.*`, `modlog.anonymizeMod` /
   `deriveDisplay` / `extractRecord`, `settings` validators). `vitest` is wired
   in `package.json` and one test file exists (`devvit/test/pipeline.test.ts`)
   but CI does not run it (§7d).
9. **App review** before public listing (`devvit publish`).

---

## 7. Known gaps / must-resolve before playtest or publish

**(a) Platform-model contradiction.** `devvit-migration/docs/03-research-platform.md:11`
states: *"The classic `Devvit.addSchedulerJob` / `Devvit.addSettings` /
`Devvit.addTrigger` builder API (from version-0.11 docs) is the *old* model.
**Target the Devvit Web model.**"* The shipped code
(`devvit/package.json:19`, `devvit/src/main.ts:32,64-67,123,157,174`) is built
entirely on the deprecated classic `@devvit/public-api@0.13.5` builder API the
research doc says not to target. This needs a deliberate decision — stay on
classic (accept the doc contradicts the code and update the doc) or port to
Devvit Web — documented explicitly, not left implicit.

**(b) `onModAction` trigger re-fetches the full moderation log.**
`devvit-migration/docs/04-architecture.md:246` (architecture §3) specifies the
trigger "does **NOT** call `getModerationLog`" and is "cheap, idempotent". The
actual trigger (`devvit/src/main.ts:174-191`) calls `ingest(reddit, redis,
cfg)`, and `ingest` (`devvit/src/modlog.ts:219-246`) unconditionally calls
`fetchActions`, which issues `reddit.getModerationLog({...}).all()`
(`devvit/src/modlog.ts:191-202`) — a full listing re-fetch on every single mod
action, not an incremental single-event ingest. Contradicts architecture §3 and
NFR-6 (`devvit-migration/docs/01-requirements.md:149`, "at most one
`updateWikiPage` write" per normal incremental run — this doesn't bound
`getModerationLog` calls the same way and multiplies read-API load under
active moderation).

**(c) FR-7/FR-8 unimplemented.** See §5 for the verified detail.

**(d) No CI for `devvit/**`.** `.github/workflows/` has no workflow that runs
`npm run type-check` or `npm test` against `devvit/`
(`docker-build.yml` and `pre-commit.yml` are the only workflows; neither
references `devvit`). The type-check-clean claim in this document has been
verified locally only, and will silently regress on the next change with no CI
gate to catch it.

**(e) GAP-1 unverified against a live event.** `addremovalreason` reason-field
extraction priority (`details` → `description`,
`devvit-migration/docs/04-architecture.md:305`) is implemented
(`devvit/src/modlog.ts:119-129`) but per the architecture doc's own sign-off
gate, "MUST confirm against one live `addremovalreason` event" before Phase 1
sign-off. No live event has been captured; this is still an assumption.

**(f) Undisclosed hash-skip behavior change vs legacy.** The legacy Python
`get_content_hash` (`modlog_wiki_publisher.py:368-370`) hashes the full
rendered content, timestamp header included. The Devvit `contentHash`
(`devvit/src/render.ts:416-428`) deliberately strips the `**Last Updated:**`
line before hashing so the hash is stable across runs with no content change.
This is very likely the *correct* fix (the legacy behavior effectively
disables hash-skip, since the timestamp always differs), but it is a real
functional behavior change from legacy, not a straight port, and was not
called out anywhere as a deliberate, disclosed change until now.

---

## 8. Dropped legacy options (intentional, no parity needed)

`client_id`, `client_secret`, `username`, `password` (platform auth);
`source_subreddit` (install context, INV-9); `update_interval` (scheduler);
`wiki_display_days` (folded into `retention_days`); `max_continuous_errors`,
`rate_limit_buffer`, `max_batch_retries` (no daemon; platform-managed retry/
rate-limit); `archive_threshold_days`, `database_path` (Redis, no SQLite);
`display_format` (fixed render). `anonymize_moderators` is hardcoded `true`
(INV-1), not a setting.
