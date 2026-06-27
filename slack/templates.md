# Lazarus — Slack audit-trail templates

These are the messages the Canvas posts via `slack.sendTextMessage`. They are the
**audit trail** judges should see on screen: every message states the root cause,
the confidence, the action Lazarus took on its own, and a link back to the
SuperPlane run so anyone can inspect the full execution graph.

> All `{{ ... }}` are SuperPlane Expr expressions resolved at run time. They parse
> Claude's strict JSON with `fromJSON($['Analyze Failure'].data.text)`. If your
> build's Expr lacks `fromJSON`, see `superplane/canvas.md` → Open questions #4.
> `slack.sendTextMessage` config is `channel` + `text` (text supports Slack mrkdwn).

---

## 1. Auto-healed (rollback path) → `#deploys`

Posted by **Slack: Rolled Back** after `render.rollbackDeploy` succeeds.

```
:recycle: *Lazarus auto-healed lazarus-web*
*Root cause:* {{ fromJSON($['Analyze Failure'].data.text).root_cause }}
*Confidence:* {{ fromJSON($['Analyze Failure'].data.text).confidence }}
*Action taken:* rolled back to last-known-good `{{ $['Read Last-Good'].data.lastGoodDeployId }}`
*Reasoning:* {{ fromJSON($['Analyze Failure'].data.text).explanation }}
*Audit trail:* <{{ root().data.runUrl }}|view this run in SuperPlane>
```

**Rendered example**

> ♻️ **Lazarus auto-healed lazarus-web**
> **Root cause:** This deploy shipped with BREAK_MODE=true, which forces /health to return 500.
> **Confidence:** 0.95
> **Action taken:** rolled back to last-known-good `dep-c0a8b211`
> **Reasoning:** /health and the boot log both show BREAK_MODE=true is the only failing check; a known-good deploy existed, so rollback cleanly restored health.
> **Audit trail:** [view this run in SuperPlane](https://app.superplane.com/…)

---

## 2. Escalated (page on-call path) → `#incidents`

Posted by **Slack: Page On-Call** after `github.createIssue`, when confidence is
below 0.7, the action isn't `rollback`, or there is no last-known-good deploy.

```
:rotating_light: *Lazarus needs a human on lazarus-web*
*Root cause:* {{ fromJSON($['Analyze Failure'].data.text).root_cause }}
*Confidence:* {{ fromJSON($['Analyze Failure'].data.text).confidence }} (below auto-rollback threshold)
*Action:* opened a GitHub issue with the evidence pack.
*Audit trail:* <{{ root().data.runUrl }}|view this run in SuperPlane>
```

**Rendered example**

> 🚨 **Lazarus needs a human on lazarus-web**
> **Root cause:** Service booted with valid config; unhealthy state is an upstream payments-API timeout plus a stale worker heartbeat, not this deploy.
> **Confidence:** 0.4 (below auto-rollback threshold)
> **Action:** opened a GitHub issue with the evidence pack.
> **Audit trail:** [view this run in SuperPlane](https://app.superplane.com/…)

---

## 3. (Optional) Healthy deploy recorded → `#deploys`

Optional confirmation you can add off the **Remember Good Deploy** node to show the
"happy path" learning its baseline. Not required for the core self-heal loop.

```
:white_check_mark: lazarus-web deploy `{{ root().data.deployId }}` is healthy — recorded as last-known-good.
```

---

## Notes for the demo

- Keep `#deploys` and `#incidents` open in the same Slack workspace you screen-share.
- The **Audit trail** link is the money line for the "make the audit trail visible"
  judging note — it points straight at the SuperPlane run graph that just lit up.
- `channel` may need a channel **ID** (e.g. `C0123ABC`) rather than `#name` depending
  on the Slack integration — confirm with `superplane index actions --name slack.sendTextMessage --output json`.
