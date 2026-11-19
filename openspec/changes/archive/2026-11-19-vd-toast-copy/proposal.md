# Proposal

## Why

Rejected command feedback currently exposes protocol codes and server message strings, while the accepted visual design uses a translated action title and reason. The reconnect banner also omits its explanatory second line.

## What Changes

- Show client-translated titles and reasons for rejected game commands in toasts and HUD messages. Unknown reasons use the translated retry fallback. Keep protocol codes only in `data-code` diagnostics.
- Add the designed continuation line to reconnect feedback in Russian and English.
- Update the game-screen and connection requirements and correct the collector to validate screenshot producer provenance.

## Out of Scope

No game rules, protocol or server behavior, layout, design tokens, or unrelated screenshot states change. Error copy remains a client concern. The OpenSpec archive and roadmap carry-over is limited to completing the already merged `vd-e2e-final-evidence` task 6.

## Canonical References

- `ROADMAP.md` — visual design and stage 8 interface requirements.
- `GAME-BREAKDOWN.md` — no game rule changes.
- `docs/design/ui-mvp-v1.html` — frame “Рента, долги, ошибки, связь”.
- `docs/efforts/visual-design/tasks/TASK-vd-toast-copy.md` — accepted behavior and verification criteria.
