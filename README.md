# ⚰️ Lazarus — the self-healing deploy agent

> Built for the SuperPlane **"Bash Script Funeral"** hackathon (Render track).
> We're holding a funeral for the `rollback.sh` script every team keeps in a
> drawer and prays it works at 3 a.m.

**Lazarus** is a [SuperPlane](https://superplane.com) Canvas that watches a
production Render deploy, and when it fails or goes unhealthy it uses **Claude**
to diagnose the cause and then **acts on its own** — either rolling the service
back to the last-known-good deploy, or opening a GitHub issue and paging on-call —
posting its full reasoning and a link to the run's audit trail in Slack. No human
in the loop.

```
deploy ends → gather (status + /health + last-good) → Claude diagnoses (strict JSON)
   → confidence ≥ 0.7 & "rollback"?  ── yes ─→ render.rollbackDeploy → Slack ✅ healed
                                      ── no  ─→ GitHub issue → Slack 🚨 paged
```

## Why this wins the room

| Judging axis | How Lazarus hits it |
|---|---|
| **Real-world usefulness** | Replaces the fragile manual "deploy broke → SSH in → guess → `rollback.sh`" ritual with an observable workflow. |
| **Technical implementation** | A real SuperPlane Canvas: parallel context-gather, Memory for last-known-good, branch logic, live Render API calls. |
| **Use of AI agents** | Claude doesn't *summarize* — it **decides** between rollback / issue / page and the Canvas executes that decision autonomously. |
| **≥ 2 Render services** | `lazarus-web` + `lazarus-worker` defined in one `render.yaml`; the agent verifies **both** through one `/health` probe. |

## Repo layout

```
render.yaml                 # both Render services (the Render-track requirement)
web/        server.js       # "production" Express app: / and /health + failure injection
worker/     worker.js       # background worker; heartbeats web (service #2)
scripts/    smoke.sh        # /health probe, non-zero on failure
            break.sh        # inject the failure on cue (sets BREAK_MODE, redeploys)
            heal.sh         # manual fallback heal
superplane/ canvas.yaml     # the Lazarus Canvas (verified schema; assumptions flagged)
            canvas.md       # node-by-node rebuild guide for the UI
            sample-event-ondeploy.json   # manual-run payload (no webhook needed)
agent/      analysis_prompt.md           # exact Claude prompt + JSON schema + 3 test cases
slack/      templates.md                 # audit-trail message formats
DEMO.md                     # the rehearsed 3-minute script
```

## The two Render services

| Service | Type | Routes / job | Failure injection |
|---|---|---|---|
| **lazarus-web** | Web | `/` version banner + status, `/health` (200 healthy / 500 broken) | `CRITICAL_CONFIG` missing → **boot crash** (deploy fails); `BREAK_MODE=true` → boots but `/health`=500 |
| **lazarus-worker** | Background worker | heartbeats `lazarus-web` `/internal/heartbeat` every 10s | `WORKER_BREAK_MODE=true` → stops heartbeats → web `/health` goes stale-unhealthy |

`lazarus-web`'s `/health` reflects **its own** config *and* the worker's heartbeat,
so the Canvas verifies both services with a single probe.

## Environment variables

**lazarus-web**
| Var | Required | Default | Effect |
|---|---|---|---|
| `CRITICAL_CONFIG` | ✅ | — | Missing → hard boot crash (deploy fails). |
| `BREAK_MODE` | — | `false` | `true` → `/health` returns 500 (primary demo break). |
| `WORKER_TIMEOUT_MS` | — | `30000` | Worker heartbeat staleness threshold. |
| `PORT` | — | `3000` | Injected by Render. |

**lazarus-worker**
| Var | Required | Default | Effect |
|---|---|---|---|
| `WEB_INTERNAL_URL` | ✅ | `http://localhost:3000` | Render injects `lazarus-web`'s `host:port`. |
| `HEARTBEAT_INTERVAL_MS` | — | `10000` | Heartbeat cadence. |
| `WORKER_BREAK_MODE` | — | `false` | `true` → stop heartbeating. |

## Run it locally (2 minutes)

```bash
# terminal 1 — web
cd web && npm install
CRITICAL_CONFIG=dev-token npm start          # http://localhost:3000

# terminal 2 — worker
cd worker && npm install
WEB_INTERNAL_URL=http://localhost:3000 npm start

# terminal 3 — probe
./scripts/smoke.sh http://localhost:3000     # ✓ healthy

# break it: stop web, restart with BREAK_MODE=true
CRITICAL_CONFIG=dev-token BREAK_MODE=true npm start
./scripts/smoke.sh http://localhost:3000     # ✗ unhealthy (HTTP 500)
```

## Deploy to Render

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick this repo → it reads `render.yaml` and
   creates **lazarus-web** + **lazarus-worker**.
3. Set `CRITICAL_CONFIG` on `lazarus-web` (it's `sync:false`, so Render prompts).
4. Use the **Starter** plan for `lazarus-web` so there's **no cold start** during
   the live demo (a spun-down free service will look broken at the worst moment).
5. Grab the public URL and put it in `superplane/canvas.yaml` → **Check Health**
   node `url`, and in `scripts/smoke.sh`.

### Why no `healthCheckPath` in render.yaml?

If Render's own health check gated the deploy, a `BREAK_MODE` deploy would be
hidden before the Canvas could see it. The whole point of Lazarus is to be the
*smart* health check that reasons about **why** `/health` is failing — so we let
the broken deploy go live and let the agent catch and heal it.

## Wire up the SuperPlane Canvas

> SuperPlane is **alpha** — the CLI is the source of truth for exact names. The
> Canvas YAML, component IDs, and built-ins here are verified from
> `superplanehq/skills` + docs.superplane.com; `configuration` key spellings and a
> few field paths are marked `# ASSUMPTION — verify` and listed in
> [`superplane/canvas.md`](superplane/canvas.md) → *Open questions*.

```bash
command -v superplane                          # must be installed first
superplane connect <URL> <TOKEN>
superplane integrations list                   # get Render/Claude/GitHub/Slack integration IDs
# replace the <…-integration-id> placeholders + the /health URL in canvas.yaml, then:
superplane apps create --canvas-file superplane/canvas.yaml
superplane apps canvas get lazarus -o yaml     # confirm no errorMessage/warningMessage
```

Confirm the flagged assumptions before the live run:
```bash
superplane index actions  --name render.rollbackDeploy --output json
superplane index actions  --name claude.textPrompt     --output json
superplane index triggers --name render.onDeploy       --output json
```

## Demo

See **[DEMO.md](DEMO.md)** for the rehearsed 3-minute script. The manual-run
trigger ([`superplane/sample-event-ondeploy.json`](superplane/sample-event-ondeploy.json))
lets you fire the Canvas without depending on a live webhook.
