# Software Factory Canvas — node by node

## What This Does
Takes a GitHub issue and automatically writes a spec, writes code, 
verifies it, and posts the result back on the issue. No human needed.

## The Story In One Line
GitHub issue opens → Claude writes spec → Claude writes code → 
Claude verifies → posts code on issue → Slack notification

## Nodes

| # | Node | What It Does |
|---|------|-------------|
| 1 | New GitHub Issue | Trigger — fires when someone opens a GitHub issue |
| 2 | Write Spec | Claude reads the issue and writes a detailed technical spec |
| 3 | Spec Written? | Gate — checks spec is long enough before continuing |
| 4 | Write Code | Claude reads the spec and writes actual working code |
| 5 | Code Written? | Gate — checks code is long enough before continuing |
| 6 | Verify Code | Claude reviews the code against the spec and approves it |
| 7 | Code Approved? | Gate — only continues if confidence is above 70% |
| 8 | Post Preview Link | Posts the spec and code as a comment on the GitHub issue |
| 9 | Slack Notification | Sends a Slack message confirming the factory completed |

## Flow Diagram

[GitHub Issue Opens]
↓
[Claude: Write Spec]
↓
[Gate: Spec long enough?] — no → stops
↓ yes
[Claude: Write Code]
↓
[Gate: Code long enough?] — no → stops
↓ yes
[Claude: Verify Code]
↓
[Gate: Confidence ≥ 70%?] — no → stops
↓ yes
[GitHub: Post comment with code]
↓
[Slack: Notify team]

## Edges
- trigger-issue → write-spec (default)
- write-spec → gate-spec (default)
- gate-spec → write-code (true only)
- write-code → gate-code (default)
- gate-code → verify-code (true only)
- verify-code → gate-verify (default)
- gate-verify → post-comment (true only)
- post-comment → notify-slack (default)

## Integration IDs Needed
- github-integration-id — connect your GitHub account in SuperPlane
- claude-integration-id — connect Claude in SuperPlane
- slack-integration-id — connect your Slack workspace in SuperPlane
