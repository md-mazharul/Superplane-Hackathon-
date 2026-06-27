# Software Factory canvas — node-by-node guide

Plain-English manual for `factory/canvas.yaml`. Build it in the SuperPlane UI from
this, or load the YAML with `superplane apps create --canvas-file factory/canvas.yaml`.

## The flow

```
GitHub issue opened
        │
        ▼
[Claude Spec Writer]  ── reads issue.title + issue.body → writes a Markdown spec
        │
        ▼
[Gate 1: spec written?]  ── len(spec) > 80 ?
        │ true                                   │ false
        ▼                                        ▼
[GitHub: post spec on issue]            [Slack: spec failed] (stop)
[GitHub: run code-gen workflow]  ── dispatch .github/workflows/factory.yml
        │ success                                  (writes code, opens PR,
        ▼                                           Render builds preview,
[Slack: factory started]                           comments preview link)
```

## Nodes

| Node | Component | What it does |
|---|---|---|
| **On GitHub Issue** | `github.onIssue` | Fires when an issue is `opened`. Payload: `data.issue.number/title/body`. |
| **Manual Run** | `start` | Demo fallback; emits a sample issue payload so you don't need a live webhook. |
| **Claude Spec Writer** | `claude.textPrompt` | Agent 1. Turns the issue into a structured spec. Output at `data.text`. |
| **Gate: spec written?** | `if` | Stage validation #1 — only continue if the spec is non-trivial. |
| **GitHub: post spec** | `github.createIssueComment` | Posts the spec back on the issue (visible proof for judges). |
| **GitHub: run code-gen workflow** | `github.runWorkflow` | Delegates the *write code + commit + PR + preview* to GitHub Actions. |
| **Slack: factory started** | `slack.sendTextMessage` | Audit trail: factory kicked off. |
| **Slack: spec failed** | `slack.sendTextMessage` | Escalation when Gate 1 fails. |

## Where the other stage validations live

- **Gate 1 (spec exists)** — in this canvas (`gate-spec`).
- **Gate 2 (code written)** — in `factory.yml` ("Validate code was written": `git diff` must be non-empty).
- **Gate 2b (app builds)** — in `factory.yml` ("Validate the app builds": `npm install` + load check).
- **Gate 3 (deploy succeeded)** — Render only publishes the preview URL when the
  preview build goes live; optionally add the verify stage below to gate on `/health` 200.

## Optional verify stage (adds "LLM does verifying" inside SuperPlane)

Add a second trigger and short branch so verification is visible on the canvas:

```
[github.onPullRequest: opened]
        ▼
[http: GET <preview-url>/health]
        ▼
[Claude Verify  (prompt_verify.md)]  → emits {"verdict","confidence","reason"}
        ▼
[Gate 3: verdict == "pass"]
        │ true                         │ false
        ▼                              ▼
[GitHub: comment ✅ preview link]   [Slack: needs a human]
```

Render auto-comments the preview URL on the PR, so the verify branch can also just
re-state it. Getting the preview URL programmatically: `render.getService` returns
`data.dashboardUrl`; the public preview URL follows Render's
`https://<service>-pr-<n>.onrender.com` pattern.

## Open questions — verify before the live run

SuperPlane is beta; confirm these with the CLI and fix the YAML:

1. **Config key spellings** for `github.createIssueComment` (`repository`,
   `issueNumber`, `body`), `github.runWorkflow` (`workflow`, `ref`, `inputs`),
   `github.onIssue` (`actions`), `claude.textPrompt` (`model`, `prompt`,
   `systemMessage`, `maxTokens`), `slack.sendTextMessage` (`channel`, `text`).
   ```
   superplane index triggers --name github.onIssue            --output json
   superplane index actions  --name github.createIssueComment --output json
   superplane index actions  --name github.runWorkflow        --output json
   superplane index actions  --name claude.textPrompt         --output json
   superplane index actions  --name slack.sendTextMessage     --output json
   ```
2. **Output-channel literals** — does `claude.textPrompt` emit on `default`? Does
   `if` use `true`/`false`? Does `github.runWorkflow` use `success`/`failed`?
   Check a real run: `superplane executions list --app-id <id> --node-id <nid> -o yaml`.
3. **Payload paths** — confirm `root().data.issue.number/title/body` and
   `$['Claude Spec Writer'].data.text`.
4. **If expression form** — the Quickstart shows the condition WITHOUT `{{ }}`;
   match whatever the UI autocompletes. `len()` availability — see Expression
   Functions docs; if absent, gate on `stopReason == "end_turn"` instead.
5. **`repository` value** — resource name vs `owner/repo`. Use the form the GitHub
   integration shows in the UI dropdown.
