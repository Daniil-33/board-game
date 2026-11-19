# Proposal

## Why

The final visual-design browser evidence needs repeatable coverage, and two accepted client-spec statements no longer match the implemented behavior or the durable logo exception record.

## What Changes

- Correct decision-surface Escape wording so purchase and auction viewers without a response have no dialog to dismiss.
- Point brand-logo size exceptions to `docs/efforts/visual-design/logo-exceptions.md`.

## Capabilities

### Modified Capabilities

- `client/game-screen` — clarify that non-deciding purchase and non-responding auction viewers receive no dialog or sheet.
- `client/logos` — identify the durable logo exception document.

## Out of Scope

No product behavior, logo assets, game rules, architecture, or other specification requirements change. E2E scripts and evidence are maintained separately under the accepted TASK-vd-e2e handoff.

## Canonical References

- `ROADMAP.md` § «Этап 3 — Покупка и аукцион» and § «Этап 4 — Рента и постройки».
- `GAME-BREAKDOWN.md` § «Покупка и аукцион» and § «Экран и решения».
