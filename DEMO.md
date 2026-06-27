# 🎬 Lazarus — 3-minute demo script

**Goal:** one clean, rehearsed end-to-end self-heal. Lead with the *pain*, show the
*agent deciding*, make the *audit trail* visible, land the *generalization*.

## Before you walk on stage (checklist)

- [ ] `lazarus-web` + `lazarus-worker` are **green** on Render, on the **Starter**
      plan (no cold start). Run `./scripts/smoke.sh https://<lazarus-web-url>` → `✓ healthy`.
- [ ] SuperPlane Canvas `lazarus` applied, no `errorMessage` on any node
      (`superplane apps canvas get lazarus -o yaml`).
- [ ] Tabs open & sized for screen-share: **(1)** SuperPlane Canvas, **(2)** the
      `lazarus-web` `/health` page, **(3)** Slack `#deploys` + `#incidents`.
- [ ] `break.sh` ready: `RENDER_API_KEY` + `RENDER_WEB_SERVICE_ID` exported.
- [ ] **Backup recording** of a full successful run saved locally (network/alpha insurance).
- [ ] Confidence threshold set so the demo deterministically hits the **rollback**
      path (Claude temp = 0; sample case → confidence 0.95).

## Script (timestamps)

### 0:00–0:25 — The funeral (the pain)
> "Every team has a `rollback.sh` they wrote at 2 a.m. and pray works the next time
> prod melts. Today we're holding its funeral. Meet **Lazarus** — it watches our
> Render deploys and *heals them itself*."

Show tab 2: `/health` returning **200 healthy**, version banner up. "This is our
production service on Render. Green. A background worker is heartbeating it — two
Render services, one health signal."

### 0:25–0:50 — Break it on cue
Run in the terminal:
```bash
./scripts/break.sh
```
> "I'm shipping a bad deploy — a config flag that breaks `/health`. This is the
> deploy that would normally page a human."

Flip to tab 2, refresh: `/health` now **500 unhealthy**, reason `BREAK_MODE=true`.

### 0:50–1:40 — The Canvas lights up (autonomy + audit trail)
Switch to tab 1 (SuperPlane Canvas). The `render.onDeploy` run is firing — narrate
the nodes lighting up:
> "SuperPlane caught the deploy. It's gathering context **in parallel** — the deploy
> logs, the live `/health`, and the last-known-good deploy id from Memory. Now it
> hands all of that to **Claude**."

Open the **Analyze Failure** node output — show the **strict JSON verdict** on screen:
```json
{"root_cause":"This deploy shipped with BREAK_MODE=true, forcing /health to 500.",
 "confidence":0.95,"recommended_action":"rollback",
 "explanation":"Only failing check is BREAK_MODE; a known-good deploy exists, so rollback restores health."}
```
> "This is the part judges asked for — the agent isn't summarizing, it's **deciding**.
> 0.95 confidence, action: rollback. So Lazarus rolls back **on its own**."

### 1:40–2:20 — Healed
Watch **Rollback Deploy** → **Slack: Rolled Back** light up. Flip to tab 2, refresh
`/health` → back to **200 healthy**.
> "Render rolled back to the last-known-good deploy. Service is green again — and no
> human touched it."

Flip to tab 3 (Slack): show the audit message — root cause, confidence, action,
**and the run link**.
> "Full audit trail in Slack: what broke, why, what it did, and a link straight to
> the SuperPlane run graph you just watched."

### 2:20–2:50 — Generalize + prize-lane nods
> "It doesn't always roll back. If Claude's confidence is low — say an upstream
> dependency outage a rollback won't fix — it opens a GitHub issue with the evidence
> pack and pages on-call instead. Same Canvas, different decision."

> "That's the funeral for `rollback.sh`: a real DevOps pain, an AI agent making and
> executing a real decision, two Render services, and a visible audit trail — observable,
> not a shell script you cross your fingers over."

### 2:50–3:00 — Close
> "Lazarus. It brings your deploys back from the dead. Thanks."

## If something fails live
- Canvas didn't fire? Use the **Manual Run** trigger with
  `superplane/sample-event-ondeploy.json` — same graph, no webhook dependency.
- Rollback hung? Run `./scripts/heal.sh` to restore green, then cut to the **backup recording**.
- Don't debug on stage. Narrate over the recording and keep the story moving.
