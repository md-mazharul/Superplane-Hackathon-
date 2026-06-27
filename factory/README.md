# Software Factory — Farin's Branch

## What This Does
Takes a GitHub issue → AI writes a spec → AI writes code → deploys to Render → posts preview link on PR

## Flow
1. GitHub issue comes in
2. Claude reads it and writes a spec
3. Claude reads spec and writes code
4. Code gets committed to a new branch
5. Render auto deploys it
6. Preview link gets posted back on the PR

## Files
- `canvas.yaml` — SuperPlane workflow
- `prompt_spec.md` — Claude prompt for writing specs
- `prompt_code.md` — Claude prompt for writing code
