# 🏭 Software Factory — issue in, deployed preview out

The hackathon's required challenge: an **AI assembly line** that takes a vague
GitHub issue and ships working, deployed, previewable code — with **no human
writing a line**. This is the companion to **Lazarus** (which heals broken
deploys). One repo, one app: the Factory *ships features into* `web/`, Lazarus
*heals* `web/`.

```
GitHub issue → Claude writes spec → ✅gate → Claude writes code (GH Actions)
  → ✅gate(code) → ✅gate(build) → open PR → Render preview env → preview link on issue/PR → Slack
```

## How code actually gets written (the hard part)

SuperPlane's GitHub component can create issues, PR comments, and pull requests,
but **cannot write or commit files**. So the canvas delegates code-gen to a
**GitHub Actions workflow** (`.github/workflows/factory.yml`) that runs our own
zero-dependency generator **`factory/generate.mjs`** — it calls the Anthropic API
with the spec, gets back a set of files (restricted to `web/`), writes them,
commits, opens a PR, and lets **Render preview environments** build it. An owned
script (vs a third-party action) is deterministic, dependency-free, and path-safe
— issue text is passed via env vars, never interpolated into shell or the prompt.
(`anthropics/claude-code-action` is kept as a commented alternative in the
workflow; `claude.runAgent` was the more-setup option; a PR-comment-only flow was
the no-real-deploy option.)

## Files

| File | Purpose |
|---|---|
| `canvas.yaml` | The SuperPlane Software Factory canvas (orchestrator + Gate 1 + Slack). |
| `canvas.md` | Node-by-node guide + the open questions to verify in the CLI. |
| `prompt_spec.md` | Agent 1 — Claude writes the spec from the issue. |
| `prompt_code.md` | Agent 2 — Claude writes the code (the canonical prompt; mirrored in `generate.mjs`). |
| `prompt_verify.md` | Agent 3 — optional Claude verification of the diff + preview. |
| `generate.mjs` | The owned code generator: calls Claude, writes files under `web/` (path-guarded). Test it offline with `DRY_RUN=1`. |
| `../.github/workflows/factory.yml` | Runs `generate.mjs`, validates stages, commits, opens PR, posts preview link. |

## Requirement coverage (judge checklist)

| Requirement | Where it's met |
|---|---|
| Input = vague idea / GitHub issue | `github.onIssue` trigger (or Manual Run for demo) |
| LLM does speccing | `Claude Spec Writer` node (`claude.textPrompt`) |
| LLM does coding | `anthropics/claude-code-action` in `factory.yml` |
| LLM does verifying | optional `Claude Verify` node (`prompt_verify.md`) |
| Each stage validates previous | Gate 1 (spec) in canvas; Gate 2 (code) + Gate 2b (build) in workflow; Gate 3 (deploy) via Render preview / verify |
| Working PoC deployed to preview | Render **preview environment** per PR (`previews: generation: automatic`) |
| Preview link on the PR | Render auto-comments it; workflow also comments the PR/issue |
| Built on SuperPlane | The whole orchestration + gates live on the canvas |
| 2+ Render services | Each preview spins up `lazarus-web` **and** `lazarus-worker` |
| AI does the heavy lifting | 3 Claude roles: spec, code, verify |

## Setup (summary — full runbook in ../PLAN.md)

1. Add repo secret `ANTHROPIC_API_KEY` (Settings → Secrets → Actions).
2. Add `previews: generation: automatic` to `render.yaml` (already done) and
   connect the repo as a Render **Blueprint**.
3. Connect GitHub + Claude + Slack integrations in SuperPlane.
4. `superplane apps create --canvas-file factory/canvas.yaml`.
5. Replace `<…-integration-id>` placeholders and verify the keys flagged in
   `canvas.md` → Open questions.
6. Open a test issue (e.g. #5368) → watch the canvas light up → PR + preview appear.
