# Lazarus Canvas — node-by-node

This documents the [`canvas.yaml`](canvas.yaml) graph in plain language so you can
**rebuild it by hand in the SuperPlane UI** if the file format drifts on the alpha
build. Component IDs are verified; `configuration` key spellings and a few field
paths are flagged as assumptions to confirm with the CLI (see end).

## The story in one line

A Render deploy of `lazarus-web` ends → Lazarus gathers the deploy status, the
live `/health`, and the last-known-good deploy id → if the deploy is failed or
unhealthy, Claude diagnoses it and returns strict JSON → Lazarus **autonomously**
rolls back (high confidence) or opens an issue + pages on-call (otherwise) → it
posts the reasoning and a run-link to Slack. A healthy deploy is just recorded as
the new last-known-good.

## Graph (ASCII)

```
 [Render onDeploy] ─┐
 [Manual Run]      ─┤
                    ├─► (Get Deploy) ───────────────┐
                    └─► (Check Health/http) ─► (Health Result/noop) ─┐
                                                                     ▼
                                                            (Merge Context)
                                                                     ▼
                                                   ┌──── (Failed or Unhealthy?/if) ────┐
                                          false (healthy)                       true (bad)
                                                   ▼                                  ▼
                                        (Remember Good Deploy/             (Read Last-Good/readMemory)
                                         upsertMemory)                  found ┌──────────┴────────┐ notFound
                                                                              ▼                    ▼
                                                                   (Analyze Failure/        (Open GitHub Issue)
                                                                    claude.textPrompt)             │
                                                                              ▼                    ▼
                                                            (Rollback or Escalate?/if)     (Slack: Page On-Call)
                                                              true ┌────────┴────────┐ false
                                                                   ▼                  ▼
                                                          (Rollback Deploy/    (Open GitHub Issue)
                                                           render.rollback)           │
                                                                   ▼                  ▼
                                                          (Slack: Rolled Back) (Slack: Page On-Call)
```

## Nodes

| # | Node (name) | Component | Why it's here |
|---|-------------|-----------|---------------|
| 1 | **Render onDeploy** | `render.onDeploy` (trigger) | Fires when a `lazarus-web` deploy ends (success or failure). Real-world entrypoint. |
| 2 | **Manual Run** | `start` (trigger) | Demo fallback — fires the same graph from the saved [`sample-event-ondeploy.json`](sample-event-ondeploy.json) payload, so you never depend on a live webhook on stage. |
| 3 | **Get Deploy** | `render.getDeploy` | Pulls this deploy's status + logs (the evidence the LLM reads). |
| 4 | **Check Health** | `http` GET `/health` | Second signal: is the live service actually serving 200? Catches BREAK_MODE (deploy "succeeds" but is sick). |
| 5 | **Health Result** | `noop` | Pass-through that funnels `http`'s `success` **and** `failure` channels into one always-firing edge, so Merge gets a deterministic input even when `/health` is 500. |
| 6 | **Merge Context** | `merge` | Fan-in barrier — waits for Get Deploy + Health Result before deciding. |
| 7 | **Failed or Unhealthy?** | `if` | The branch gate: `deploy status is a failure OR /health ≠ 200`. False = healthy. |
| 8 | **Remember Good Deploy** | `upsertMemory` | Healthy path. Stores `lastGoodDeployId = <this deployId>` in the `lazarus` namespace — this is what a future rollback targets. (Spec step 7.) |
| 9 | **Read Last-Good** | `readMemory` | Unhealthy path. Reads the last-known-good id. `found` → analyze; `notFound` → can't roll back, escalate directly. |
| 10 | **Analyze Failure** | `claude.textPrompt` | **The agent.** Gets status + logs + /health + last-good id; returns strict JSON `{root_cause, confidence, recommended_action, explanation}`. Prompt in [`../agent/analysis_prompt.md`](../agent/analysis_prompt.md). |
| 11 | **Rollback or Escalate?** | `if` | Autonomy gate: `confidence ≥ 0.7 AND recommended_action == "rollback"`. |
| 12 | **Rollback Deploy** | `render.rollbackDeploy` | Autonomous heal — rolls `lazarus-web` back to `lastGoodDeployId`. |
| 13 | **Slack: Rolled Back** | `slack.sendTextMessage` | Audit trail: root cause, confidence, action, run-link. |
| 14 | **Open GitHub Issue** | `github.createIssue` | Escalation — files the evidence pack for a human. Reached from low-confidence verdicts **and** the no-last-good case. |
| 15 | **Slack: Page On-Call** | `slack.sendTextMessage` | Pages a human with the reasoning + run-link. |

## Edges / channels

- Both triggers → **Get Deploy** and **Check Health** (`default`).
- **Check Health** → **Health Result** on both `success` and `failure`.
- **Get Deploy** + **Health Result** → **Merge Context** (`default`); Merge → **Failed or Unhealthy?** (`success`).
- **Failed or Unhealthy?** → **Remember Good Deploy** (`false`) / **Read Last-Good** (`true`).
- **Read Last-Good** → **Analyze Failure** (`found`) / **Open GitHub Issue** (`notFound`).
- **Analyze Failure** → **Rollback or Escalate?** (`default`).
- **Rollback or Escalate?** → **Rollback Deploy** (`true`) / **Open GitHub Issue** (`false`).
- **Rollback Deploy** → **Slack: Rolled Back** (`success`); **Open GitHub Issue** → **Slack: Page On-Call** (`default`).

## Open questions to confirm against a live instance

1. **Config key spellings** for `render.*`, `claude.textPrompt`, `github.createIssue`,
   `slack.sendTextMessage` — run `superplane index actions --name <id> --output json`.
2. **Channel literals** — does `render.rollbackDeploy` emit `success`/`failed`? Does
   `merge` emit `success`? Does `claude.textPrompt` emit `default`? Confirm via
   `index actions` and a first real run.
3. **Payload paths** — `.data.status` enum values for a failed deploy, `.data.statusCode`
   / `.data.body` on the `http` node, and `readMemory`'s output path for the stored value
   (`.data.lastGoodDeployId` vs `.data.values.lastGoodDeployId`). Confirm with
   `superplane executions list --app-id <id> --node-id <nid> -o yaml` after the first run.
4. **`fromJSON()` in Expr** — the `if` nodes and Slack/GitHub templates parse Claude's
   JSON text with `fromJSON(...)`. If Expr lacks it, either (a) instruct the Claude step
   to emit structured fields, or (b) add an `http`/transform node that parses the JSON and
   exposes `confidence` / `recommended_action` as plain fields, then reference those.
5. **`runUrl`** — `{{ root().data.runUrl }}` is a placeholder for the SuperPlane run link
   shown in Slack. Confirm how the current build exposes the execution/run URL.
