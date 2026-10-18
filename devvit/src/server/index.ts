/**
 * Devvit Web server. Every endpoint is internal: the scheduler, menu items and
 * settings validators declared in devvit.json POST here.
 */
import { serve } from '@hono/node-server';
import { context, createServer, getServerPort, redis, settings } from '@devvit/web/server';
import type { TaskResponse } from '@devvit/web/server';
import type { MenuItemRequest, SettingsValidationRequest, SettingsValidationResponse, UiResponse } from '@devvit/web/shared';
import { Hono } from 'hono';

import { describeResult, runCycle, type CycleMode } from '../core/publish.js';
import {
  loadConfig,
  validateAnonymize,
  validateDays,
  validateIgnoredModerators,
  validateWikiActions,
  validateWikiPage,
  type Validator,
} from '../core/settings.js';
import { Store } from '../core/store.js';
import { devvitReddit } from './reddit.js';

const app = new Hono();
const store = new Store(redis);

async function currentConfig() {
  return loadConfig(await settings.getAll<Record<string, unknown>>(), context.subredditName);
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

app.post('/internal/cron/publish', async (c) => {
  try {
    const cfg = await currentConfig();
    const result = await runCycle(devvitReddit, store, cfg, 'scheduled');
    console.log(`cron publish r/${cfg.subredditName}: ${describeResult(result, cfg.wikiPage)} pruned=${result.pruned}`);
  } catch (err) {
    console.error(`cron publish failed: ${errorText(err)}`);
  }
  return c.json<TaskResponse>({}, 200);
});

async function menuCycle(mode: CycleMode): Promise<UiResponse> {
  try {
    const cfg = await currentConfig();
    const result = await runCycle(devvitReddit, store, cfg, mode);
    console.log(`${mode} r/${cfg.subredditName}: ${describeResult(result, cfg.wikiPage)}`);
    return { showToast: { text: describeResult(result, cfg.wikiPage), appearance: result.status === 'busy' ? 'neutral' : 'success' } };
  } catch (err) {
    console.error(`${mode} failed: ${errorText(err)}`);
    return { showToast: { text: `Modlog ${mode} failed: ${errorText(err)}`, appearance: 'neutral' } };
  }
}

app.post('/internal/menu/publish-now', async (c) => {
  await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(await menuCycle('publish-now'));
});

app.post('/internal/menu/force-rebuild', async (c) => {
  await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(await menuCycle('force-rebuild'));
});

app.post('/internal/menu/test-connection', async (c) => {
  await c.req.json<MenuItemRequest>();
  const checks: string[] = [];
  try {
    const cfg = await currentConfig();
    checks.push(`settings ok (wiki/${cfg.wikiPage}, ${cfg.displayDays}d shown, ${cfg.retentionDays}d kept)`);
    const log = await devvitReddit.fetchModLog(cfg.subredditName, 1);
    checks.push(`mod log readable (${log.length} entry)`);
    const page = await devvitReddit.readWiki(cfg.subredditName, cfg.wikiPage);
    checks.push(page === null ? 'wiki page not created yet' : `wiki page exists (${Buffer.byteLength(page, 'utf8')} bytes)`);
    checks.push(`${await store.storedCount()} actions stored`);
    const status = await store.getStatus();
    if (status.lastRunAt) checks.push(`last run ${status.lastRunAt} (${status.lastResult ?? 'unknown'})`);
    console.log(`test-connection: ${checks.join('; ')}`);
    return c.json<UiResponse>({ showToast: { text: checks.join('; '), appearance: 'success' } });
  } catch (err) {
    checks.push(`FAILED: ${errorText(err)}`);
    console.error(`test-connection: ${checks.join('; ')}`);
    return c.json<UiResponse>({ showToast: { text: checks.join('; '), appearance: 'neutral' } });
  }
});

function validationRoute<T>(path: string, validate: Validator<T>): void {
  app.post(path, async (c) => {
    const { value } = await c.req.json<SettingsValidationRequest<T>>();
    const error = validate(value);
    return c.json<SettingsValidationResponse>(error ? { success: false, error } : { success: true });
  });
}

validationRoute('/internal/settings/validate-wiki-page', validateWikiPage);
validationRoute('/internal/settings/validate-days', validateDays);
validationRoute('/internal/settings/validate-actions', validateWikiActions);
validationRoute('/internal/settings/validate-anonymize', validateAnonymize);
validationRoute('/internal/settings/validate-ignored', validateIgnoredModerators);

serve({ fetch: app.fetch, createServer, port: getServerPort() });
