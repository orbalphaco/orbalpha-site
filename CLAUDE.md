# orbalpha-site

Public marketing/tools site. Vercel serves it from `main`, and **`main` auto-promotes to
production** — anything merged is live, and anything committed to any branch is world-readable
while this repo is public.

## Hard rule: this repo is publication, not a workspace

Treat every commit here as a public release. Do not commit, and do not create on a branch:

- Research, analysis, findings, backtests, harnesses, or their outputs (CSV/JSON/logs).
- Selection methodology, card configurations, seeds, corpus filenames or hashes, sizing
  or account figures, broker/prop-account details.
- Personal names, emails, or anything identifying the operator.
- Private notes, handoffs, session summaries, or planning documents.

Research lives outside this repo. If a piece of it is meant to become public, that is an
explicit decision made first, then a deliberate commit of only the reviewed material.

**Pushing a branch is publishing.** A branch push is immediately readable by anyone, and
deleting the branch afterwards does not fully retract it — the commit stays fetchable by hash
until GitHub garbage-collects it. Ask before pushing anything that is not site content.

## Before any commit

- Re-read the diff for the categories above. If unsure whether something belongs, ask.
- Commit messages are public too: describe the change, not the methodology behind it.
- Scratch work belongs in the session scratchpad directory, never in the working tree.

## Access gating

`middleware.ts` gates only the paths in its `matcher`. Every other path under `tools/` is
served to anonymous visitors. Adding a tool directory does not gate it — the matcher must be
updated deliberately.
