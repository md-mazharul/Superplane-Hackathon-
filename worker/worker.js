'use strict';

/**
 * Lazarus demo background worker (Render service #2: lazarus-worker).
 *
 * A Render Background Worker has no public HTTP port, so it reports liveness by
 * POSTing a heartbeat to lazarus-web's /internal/heartbeat endpoint on an
 * interval. lazarus-web folds that into its own /health response, so the Lazarus
 * Canvas verifies BOTH Render services through a single /health probe.
 *
 * Failure-injection: set WORKER_BREAK_MODE=true to stop heartbeating. Within
 * WORKER_TIMEOUT_MS the web /health turns unhealthy -> the agent can also
 * self-heal a dead worker, not just a bad web deploy.
 *
 * Requires Node >=18 (global fetch).
 */

const VERSION = process.env.APP_VERSION || process.env.RENDER_GIT_COMMIT || '1.4.2';
const SERVICE = 'lazarus-worker';
// Render's `fromService` gives a bare "host:port" with no scheme; normalize it.
const RAW_WEB_URL = process.env.WEB_INTERNAL_URL || 'http://localhost:3000';
const WEB_INTERNAL_URL = (/^https?:\/\//.test(RAW_WEB_URL) ? RAW_WEB_URL : `http://${RAW_WEB_URL}`).replace(/\/$/, '');
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '10000', 10);
const WORKER_BREAK_MODE = String(process.env.WORKER_BREAK_MODE || 'false').toLowerCase() === 'true';

function log(level, event, extra) {
  process.stdout.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: SERVICE,
      version: VERSION,
      event,
      ...extra,
    }) + '\n'
  );
}

log('info', 'boot', {
  msg: 'lazarus-worker starting',
  web_internal_url: WEB_INTERNAL_URL,
  heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
  worker_break_mode: WORKER_BREAK_MODE,
});

if (WORKER_BREAK_MODE) {
  log('warn', 'worker_break_mode_active', {
    reason: 'WORKER_BREAK_MODE=true',
    effect: 'worker will NOT send heartbeats; lazarus-web /health will go unhealthy',
  });
}

let beats = 0;

async function heartbeat() {
  if (WORKER_BREAK_MODE) {
    log('error', 'heartbeat_skipped', { reason: 'WORKER_BREAK_MODE=true' });
    return;
  }
  try {
    const res = await fetch(`${WEB_INTERNAL_URL}/internal/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker: SERVICE, version: VERSION, seq: ++beats }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    log('info', 'heartbeat_ok', { seq: beats });
  } catch (err) {
    log('error', 'heartbeat_failed', { seq: beats, error: String(err && err.message ? err.message : err) });
  }
}

// Fire one immediately, then on the interval.
heartbeat();
setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

// Keep the process alive and log a periodic liveness line.
setInterval(() => log('info', 'alive', { beats }), Math.max(HEARTBEAT_INTERVAL_MS * 3, 30000));
