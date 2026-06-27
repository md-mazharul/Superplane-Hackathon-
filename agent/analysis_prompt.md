# Lazarus — Claude Analysis Prompt (`claude.textPrompt`)

This is the exact prompt the **Claude component** runs after Lazarus detects a
failed or unhealthy `lazarus-web` deploy. It must return **strict JSON only** —
no prose, no markdown fences — so a downstream `if` node can branch on it.

- **Component:** `claude.textPrompt`
- **Model:** `claude-opus-4-8` (most capable; use `claude-sonnet-4-6` if you want
  faster/cheaper for the demo — both return identical JSON shape)
- **Max Tokens:** `1024`
- **Temperature:** `0` (deterministic verdicts make a live demo reproducible)

---

## System Message

```
You are Lazarus, an autonomous site-reliability agent embedded in a SuperPlane
deploy pipeline. A deploy of the production service "lazarus-web" on Render has
just failed or is reporting an unhealthy /health endpoint. Your job is to decide,
WITHOUT a human, what to do next.

You will be given: the Render deploy status, the deploy/build logs, the latest
/health JSON response, and the ID of the last-known-good deploy.

Choose exactly one recommended_action:
  - "rollback"    : a previous deploy is known good and the failure is clearly
                    caused by THIS deploy (bad config, crash on boot, forced
                    unhealthy, broken build). Safe to roll back automatically.
  - "open_issue"  : the root cause needs a human/code change and is NOT fixed by
                    rolling back (e.g. an upstream dependency outage, a data
                    problem, or you are not confident a rollback helps).
  - "page"        : ambiguous, low-confidence, or potential data-loss/security
                    risk that needs a human on the phone now.

Rules:
  - Set confidence in [0,1]. Use >= 0.7 ONLY when the logs clearly support the
    root cause AND a last-known-good deploy exists for a rollback.
  - If no last-known-good deploy id is provided, you may NOT recommend "rollback".
  - root_cause: one tight sentence naming the actual cause.
  - explanation: 1-3 sentences of reasoning a tired on-call engineer can trust,
    citing the specific log line or health reason.

Output ONLY a single JSON object, no code fences, matching exactly:
{"root_cause": string, "confidence": number, "recommended_action": "rollback" | "open_issue" | "page", "explanation": string}
```

## User Message (template — filled by SuperPlane expressions)

```
Service: lazarus-web
Render deploy status: {{ $['Get Deploy'].data.status }}
Failed deploy id: {{ root().data.deployId }}
Last-known-good deploy id: {{ $['Read Last-Good'].data.lastGoodDeployId }}

--- /health response (HTTP {{ $['Check Health'].data.statusCode }}) ---
{{ $['Check Health'].data.body }}

--- deploy / build logs ---
{{ $['Get Deploy'].data.logs }}
```

> `// ASSUMPTION — verify against docs`: the exact output field of
> `claude.textPrompt` is `text` (confirmed in docs) but the **input config key**
> names (`model`, `prompt`, `systemMessage`, `maxTokens`, `temperature`) and the
> upstream field paths above (`.data.logs`, `.data.body`, `.data.statusCode`,
> `.data.lastGoodDeployId`) are best-effort. Confirm with
> `superplane index actions --name claude.textPrompt --output json` and by
> inspecting a real `render.getDeploy` / `http` execution payload, then fix the
> paths. Open question: does `render.getDeploy` return logs inline, or do we need
> a separate logs fetch / `http` call to the Render logs API?

---

## JSON Schema (what downstream nodes rely on)

```json
{
  "type": "object",
  "required": ["root_cause", "confidence", "recommended_action", "explanation"],
  "properties": {
    "root_cause":          { "type": "string" },
    "confidence":          { "type": "number", "minimum": 0, "maximum": 1 },
    "recommended_action":  { "type": "string", "enum": ["rollback", "open_issue", "page"] },
    "explanation":         { "type": "string" }
  },
  "additionalProperties": false
}
```

---

## Sample inputs → expected outputs (offline test fixtures)

These were used to validate the prompt offline before wiring the Canvas. Run the
prompt against each "input" and confirm the model returns the "expected" JSON.

### Sample 1 — forced-unhealthy (BREAK_MODE) — the primary demo case

**Input (user message):**
```
Service: lazarus-web
Render deploy status: live
Failed deploy id: dep-d1f7c9aa
Last-known-good deploy id: dep-c0a8b211

--- /health response (HTTP 500) ---
{"service":"lazarus-web","version":"e3b1c44","status":"unhealthy","checks":{"critical_config":"present","break_mode":"active","worker_heartbeat":{"healthy":true,"reason":"ok"}},"reasons":["BREAK_MODE=true (forced unhealthy for demo)"]}

--- deploy / build logs ---
{"level":"warn","service":"lazarus-web","event":"break_mode_active","reason":"BREAK_MODE=true","effect":"GET /health will report 500 unhealthy until BREAK_MODE is set back to false"}
{"level":"info","service":"lazarus-web","event":"listening","port":10000}
```

**Expected output:**
```json
{"root_cause":"This deploy shipped with BREAK_MODE=true, which forces /health to return 500 even though the process is up and the worker is healthy.","confidence":0.95,"recommended_action":"rollback","explanation":"The /health reason and the boot log both show BREAK_MODE=true is the sole failing check; critical_config and worker_heartbeat are fine. A last-known-good deploy (dep-c0a8b211) exists, so rolling back to it cleanly restores health."}
```

### Sample 2 — missing required config (hard boot crash) — failed build/deploy

**Input (user message):**
```
Service: lazarus-web
Render deploy status: build_failed
Failed deploy id: dep-9b2e110f
Last-known-good deploy id: dep-c0a8b211

--- /health response (HTTP 000) ---
(no response — service never started listening)

--- deploy / build logs ---
{"level":"fatal","service":"lazarus-web","event":"boot_failed","reason":"CRITICAL_CONFIG is not set","hint":"Set the CRITICAL_CONFIG environment variable on the lazarus-web service.","fix":"render env set CRITICAL_CONFIG=<value> and redeploy"}
==> Exited with status 1
```

**Expected output:**
```json
{"root_cause":"The new deploy crashed on boot because the required CRITICAL_CONFIG environment variable is missing, so the process exited 1 and never served traffic.","confidence":0.9,"recommended_action":"rollback","explanation":"The fatal boot_failed log explicitly names CRITICAL_CONFIG as unset and the process exited with status 1. The previous deploy dep-c0a8b211 had the variable set and was healthy, so a rollback immediately restores service while the env var is fixed."}
```

### Sample 3 — ambiguous upstream error, no clear culprit — page a human

**Input (user message):**
```
Service: lazarus-web
Render deploy status: live
Failed deploy id: dep-77ce40b3
Last-known-good deploy id: (none recorded)

--- /health response (HTTP 500) ---
{"service":"lazarus-web","version":"a91ff02","status":"unhealthy","reasons":["upstream payments API timeout after 5000ms","worker heartbeat stale (48210ms > 30000ms)"]}

--- deploy / build logs ---
{"level":"info","service":"lazarus-web","event":"boot","critical_config_present":true,"break_mode":false}
{"level":"info","service":"lazarus-web","event":"listening","port":10000}
{"level":"error","service":"lazarus-web","event":"health_check","status":"unhealthy","reasons":["upstream payments API timeout after 5000ms","worker heartbeat stale (48210ms > 30000ms)"]}
```

**Expected output:**
```json
{"root_cause":"The service booted cleanly with valid config; the unhealthy state is driven by an external payments-API timeout plus a stale worker heartbeat, not by anything in this deploy.","confidence":0.4,"recommended_action":"page","explanation":"Config and BREAK_MODE are fine and the boot succeeded, so this is not a bad-deploy a rollback would fix, and no last-known-good deploy id was recorded. The combination of an upstream dependency timeout and a dead worker needs a human to investigate."}
```

---

## How the Canvas consumes this

The downstream **Decide** (`if`) node branches on the JSON:

```
confidence >= 0.7 AND recommended_action == "rollback"   ->  render.rollbackDeploy
otherwise                                                ->  github.createIssue + slack page
```

See [`../superplane/canvas.md`](../superplane/canvas.md) for the exact node/edge wiring.
