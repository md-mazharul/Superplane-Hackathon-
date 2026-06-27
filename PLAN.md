# 🛩️ SuperPlane Hackathon — Execution Plan

Your step-by-step runbook to go from "repo on disk" to "live demo in front of
judges." Read top to bottom; do the **Setup** once, then **Test**, then **Demo**.

---

## 0. Where you are right now

You already have the **Lazarus** project built (web app, worker, `render.yaml`, the
Lazarus canvas). You have a SuperPlane org + app created here:
`app.superplane.com/0862489f-…/apps/d4f68204-…`.

What was **missing** is the actual hackathon challenge — the **Software Factory**
(issue → spec → code → preview → PR link). That's now scaffolded in `factory/` +
`.github/workflows/factory.yml`. This plan wires both up.

### The story that wins the room
**One app, two AI agents.** The **Factory** *ships features into* `web/`; **Lazarus**
*heals* `web/` when a deploy breaks. Full engineering lifecycle, no humans.

```
Factory:  GitHub issue → Claude spec → ✅ → Claude code (GH Actions) → ✅ → PR → Render preview → preview link + Slack
Lazarus:  Render deploy fails → gather context → Claude diagnoses → rollback OR open issue+page → Slack
```

---

## 1. The one hard truth to design around

SuperPlane's **GitHub component cannot write or commit files** (it only does
issues / PR comments / pull requests). So "Claude writes the code" is delegated to
a **GitHub Actions workflow** (`anthropics/claude-code-action`) that writes code,
commits, opens a PR, and lets **Render preview environments** build it. SuperPlane
stays the **orchestrator + validation gates + the speccing/verifying AI**. This is
the reliable path for a 3-minute live demo.

---

## 2. Accounts & things to have open

| Need | Where | Note |
|---|---|---|
| SuperPlane org + app | already created | you have the URL |
| GitHub repo | push `Superplane-Hackathon-` to GitHub | the factory + Render both read it |
| Claude API key | handed out at the hackathon | used in 2 places (SuperPlane + GH secret) |
| Render account | render.com | $50 credit; **see plan caveat in §6** |
| Slack workspace | any you can install an app into | for the audit trail |
| SuperPlane CLI | `superplane` on your machine | source of truth for component keys |

---

## 3. Setup — do this once (≈40 min with your team lead)

### Step 1 — Push the repo to GitHub
```bash
cd Superplane-Hackathon-
git add -A && git commit -m "factory + plan" && git push
```

### Step 2 — Add the GitHub Actions secret
Repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `ANTHROPIC_API_KEY` = the Claude key from the hackathon.
(`GITHUB_TOKEN` is automatic. The workflow needs no other secret.)

### Step 3 — Connect integrations in SuperPlane
In the SuperPlane app → **Settings → Integrations** (or the CLI), connect:
**GitHub** (select your repo), **Claude** (paste API key), **Slack** (pick
workspace + channels `#factory`, `#deploys`, `#incidents`), **Render** (API key
from Render → Account Settings → API Keys).

Then grab the integration IDs you'll paste into the canvases:
```bash
superplane connect <YOUR-APP-URL> <TOKEN>
superplane integrations list      # copy the Render / Claude / GitHub / Slack IDs
```

### Step 4 — Deploy to Render (Blueprint + previews)
1. Render → **New → Blueprint** → pick the repo. It reads `render.yaml` and creates
   **lazarus-web** + **lazarus-worker** (that's your 2+ services).
2. When prompted, set **`CRITICAL_CONFIG`** on `lazarus-web` (it's `sync:false`).
3. Use the **Starter** plan for `lazarus-web` (no cold-start mid-demo).
4. `render.yaml` now has `previews: generation: automatic`, so every PR the Factory
   opens gets its **own preview environment** and Render comments the preview URL on
   the PR. (Confirm previews are enabled for the Blueprint in the Render dashboard.)
5. Copy the live `lazarus-web` URL into:
   - `superplane/canvas.yaml` → **Check Health** node `url`
   - `scripts/smoke.sh`

### Step 5 — Load BOTH canvases
```bash
# replace the <…-integration-id> placeholders + the /health URL first, then:
superplane apps create --canvas-file superplane/canvas.yaml   # Lazarus
superplane apps create --canvas-file factory/canvas.yaml      # Software Factory

# confirm no errors/warnings on any node:
superplane apps canvas get lazarus          -o yaml
superplane apps canvas get software-factory -o yaml
```

### Step 6 — Verify the flagged assumptions (important — beta product)
The YAML marks every uncertain key with `# ASSUMPTION — verify`. Confirm the real
keys and channel names, then fix the YAML:
```bash
superplane index triggers --name github.onIssue            --output json
superplane index actions  --name github.createIssueComment --output json
superplane index actions  --name github.runWorkflow        --output json
superplane index actions  --name claude.textPrompt         --output json
superplane index actions  --name render.rollbackDeploy     --output json
```
Full list in `factory/canvas.md` → *Open questions* and the header of each canvas.

---

## 4. Test before judges arrive

### Test 1 — Software Factory
Open a GitHub issue:
> **Title:** Add markdown view mode
> **Body:** Users should be able to switch to a markdown view mode with mermaid.js diagrams.

Watch: the **software-factory** canvas lights up → spec comment appears on the issue
→ the `software-factory` GitHub Action runs → a **PR** opens → Render posts a
**preview URL** on the PR → `#factory` Slack message. ✅

### Test 2 — Lazarus
```bash
./scripts/break.sh           # flips BREAK_MODE / redeploys → /health 500
```
Watch: the **lazarus** canvas fires → Claude diagnoses → rolls back (or opens issue
+ pages) → `#deploys` / `#incidents` Slack. If it doesn't self-heal: `./scripts/heal.sh`.

If both work → you're demo-ready.

---

## 5. The 5 test issues the judges will paste

The factory reads each issue and ships a minimal implementation into `web/`:

| # | Issue | Factory does |
|---|---|---|
| #5368 | Markdown view mode (mermaid.js, mention chips) | spec → add a `/markdown` view + render in `web/` |
| #5366 | Canvas version diff highlighting | spec → add a diff endpoint/view in `web/` |
| #5164 | Send execution to agent chat | spec → add a small endpoint/button in `web/` |
| #5704 | Run inspection UX fixes | spec → adjust the `web/` UI |
| #5705 | Canvas warnings improvements | spec → add a warnings panel in `web/` |

> Scope is intentionally fenced to `web/` (see `factory/prompt_code.md`) so a
> generated change can never break Lazarus. Each produces a real PR + preview.

---

## 6. Risks & mitigations (read this)

| Risk | Mitigation |
|---|---|
| **Render webhooks need a Professional plan.** Lazarus's `render.onDeploy` auto-trigger may not fire on the free credit. | Demo Lazarus with the **Manual Run** trigger (already in the canvas) and `break.sh`. `render.rollbackDeploy` falls back to **polling**, so healing still works. Upgrade only if you want the live webhook. |
| The Factory's Render preview is driven by **Render's own GitHub app** (PR → preview), *not* SuperPlane webhooks — so it's **unaffected** by the plan caveat. | Just make sure previews are enabled on the Blueprint. |
| Beta product: a `configuration` key or channel name is wrong → node errors. | §3 Step 6 — verify with `superplane index …`; every guess is flagged in the YAML. |
| `claude-code-action` setup quirks in CI. | Pin it, keep `--max-turns` modest; the workflow's Gate 2 fails loudly if no code was produced so you find out in testing, not on stage. |
| Free web service cold-starts and looks "broken." | Use the **Starter** plan for `lazarus-web`. |
| Live code-gen takes >30s. | Demo the canvas + spec comment live, then show the PR/preview that finished during your talk (matches the PDF's "wait 30s" testing note). |

---

## 7. Live demo runbook (3 min)

**You — 90s (Factory):** open a GitHub issue on stage → "watch this" → point at the
canvas lighting up green → spec comment lands on the issue → show the PR + Render
preview URL → *"Claude wrote the spec, wrote the code, deployed it. No human wrote
anything."*

**Team lead — 90s (Lazarus):** `./scripts/break.sh` → site breaks → Lazarus canvas
fires → Slack message → site heals itself.

**Together — 30s:** *"Two AI agents. One ships features automatically. One heals
broken deploys automatically. Full engineering lifecycle. No humans needed."*

(Full word-for-word script: `DEMO.md`.)

---

## 8. Pre-judge checklist

- [ ] Repo pushed; `ANTHROPIC_API_KEY` secret set
- [ ] Render Blueprint up: `lazarus-web` + `lazarus-worker` live (Starter plan)
- [ ] `CRITICAL_CONFIG` set; previews enabled on the Blueprint
- [ ] GitHub / Claude / Slack / Render integrations connected in SuperPlane
- [ ] Both canvases loaded; **no errorMessage/warningMessage** on any node
- [ ] All `# ASSUMPTION — verify` keys confirmed via `superplane index …`
- [ ] `/health` URL pasted into `superplane/canvas.yaml` + `scripts/smoke.sh`
- [ ] Test 1 (Factory on #5368) produced a PR + preview link
- [ ] Test 2 (Lazarus via `break.sh`) self-healed
- [ ] `DEMO.md` rehearsed; `heal.sh` ready as the backup

---

### Quick reference — what each new file is

| File | Role |
|---|---|
| `PLAN.md` | this runbook |
| `factory/canvas.yaml` | the Software Factory SuperPlane canvas |
| `factory/canvas.md` | node-by-node guide + keys to verify |
| `factory/prompt_spec.md` / `prompt_code.md` / `prompt_verify.md` | the 3 Claude roles |
| `factory/generate.mjs` | owned code generator — calls Claude, writes files under `web/` (path-guarded; `DRY_RUN=1` to test offline) |
| `.github/workflows/factory.yml` | runs `generate.mjs`, validates stages, opens PR + preview, comments |
| `render.yaml` | now also enables per-PR preview environments |
