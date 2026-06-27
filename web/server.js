'use strict';

/**
 * Lazarus demo "production" web service (Render service #1: lazarus-web).
 *
 * Two deliberate failure modes drive the Lazarus self-heal demo:
 *
 *   1. CRITICAL_CONFIG missing  -> HARD boot crash (process.exit(1)).
 *      Render marks the deploy FAILED. render.onDeploy fires with status=failed.
 *
 *   2. BREAK_MODE=true          -> boots and goes live, but GET /health returns 500.
 *      Render marks the deploy succeeded; the Canvas's post-deploy /health probe
 *      catches the unhealthy state. This is the primary demo path because the
 *      rollback visibly flips /health back to 200.
 *
 * All boot + health output is single-line structured JSON so the Claude
 * component can parse it directly from the Render deploy logs.
 */

const express = require('express');

const PORT = process.env.PORT || 3000;
const VERSION =
  process.env.APP_VERSION ||
  process.env.RENDER_GIT_COMMIT ||
  require('./package.json').version ||
  'dev';
const SERVICE = 'lazarus-web';

// Failure-injection + tuning knobs.
const CRITICAL_CONFIG = process.env.CRITICAL_CONFIG; // required; missing => boot crash
const BREAK_MODE = String(process.env.BREAK_MODE || 'false').toLowerCase() === 'true';
const WORKER_TIMEOUT_MS = parseInt(process.env.WORKER_TIMEOUT_MS || '30000', 10);

// In-memory record of the last worker heartbeat (worker is Render service #2).
let lastWorkerBeat = null; // { worker, ts (epoch ms), version }

function log(level, event, extra) {
  // One JSON object per line -> easy for the LLM (and humans) to parse.
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

// --- Boot-time required-config gate (failure mode #1) ---------------------
if (!CRITICAL_CONFIG) {
  log('fatal', 'boot_failed', {
    reason: 'CRITICAL_CONFIG is not set',
    hint: 'Set the CRITICAL_CONFIG environment variable on the lazarus-web service.',
    fix: 'render env set CRITICAL_CONFIG=<value>  (or restore it in the dashboard) and redeploy',
  });
  // Non-zero exit => Render deploy fails => render.onDeploy(status=failed).
  process.exit(1);
}

log('info', 'boot', {
  msg: 'lazarus-web starting',
  critical_config_present: true,
  break_mode: BREAK_MODE,
  worker_timeout_ms: WORKER_TIMEOUT_MS,
});

if (BREAK_MODE) {
  log('warn', 'break_mode_active', {
    reason: 'BREAK_MODE=true',
    effect: 'GET /health will report 500 unhealthy until BREAK_MODE is set back to false',
  });
}

// --------------------------------------------------------------------------

const app = express();
app.use(express.json());

function workerStatus() {
  if (!lastWorkerBeat) {
    return { healthy: false, reason: 'no worker heartbeat received yet', lastBeatAgeMs: null };
  }
  const ageMs = Date.now() - lastWorkerBeat.ts;
  return {
    healthy: ageMs <= WORKER_TIMEOUT_MS,
    reason: ageMs <= WORKER_TIMEOUT_MS ? 'ok' : `worker heartbeat stale (${ageMs}ms > ${WORKER_TIMEOUT_MS}ms)`,
    lastBeatAgeMs: ageMs,
    worker: lastWorkerBeat.worker,
  };
}

// Internal endpoint the worker posts heartbeats to. Ties the two Render
// services together: a dead worker makes lazarus-web report unhealthy.
app.post('/internal/heartbeat', (req, res) => {
  lastWorkerBeat = {
    worker: (req.body && req.body.worker) || 'lazarus-worker',
    ts: Date.now(),
    version: (req.body && req.body.version) || 'unknown',
  };
  res.json({ ok: true, received: lastWorkerBeat });
});

// Version banner + quick status.
app.get('/', (req, res) => {
  const w = workerStatus();
  res.json({
    service: SERVICE,
    version: VERSION,
    status: BREAK_MODE || !w.healthy ? 'unhealthy' : 'healthy',
    break_mode: BREAK_MODE,
    worker: w,
    message: '⚰️  Lazarus demo app — flip BREAK_MODE to break me, watch the agent heal me.',
  });
});

// Health probe consumed by the Lazarus Canvas (and humans).
app.get('/health', (req, res) => {
  const reasons = [];
  if (BREAK_MODE) reasons.push('BREAK_MODE=true (forced unhealthy for demo)');

  const w = workerStatus();
  if (!w.healthy) reasons.push(w.reason);

  const healthy = reasons.length === 0;
  const body = {
    service: SERVICE,
    version: VERSION,
    status: healthy ? 'healthy' : 'unhealthy',
    checks: {
      critical_config: 'present',
      break_mode: BREAK_MODE ? 'active' : 'inactive',
      worker_heartbeat: w,
    },
    reasons,
    timestamp: new Date().toISOString(),
  };

  log(healthy ? 'info' : 'error', 'health_check', { status: body.status, reasons });
  res.status(healthy ? 200 : 500).json(body);
});

app.listen(PORT, () => {
  log('info', 'listening', { port: Number(PORT) });
});
