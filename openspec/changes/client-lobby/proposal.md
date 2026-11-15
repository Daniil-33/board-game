# Proposal

## Why

The existing client-stage-1-skeleton client predates effort revision 3. It
offers joining every listed room, has no access-code/invite or leave flow,
and treats finished games as lobby rooms. Member names are looked up through
the public list, and successful background polls leave prior errors visible.

## What Changes

- Show room availability and support optional access codes and invite joins.
- Add pre-start leave and room-closure navigation with a clear notice.
- Add confirmed resignation, spectator presentation, elimination markers,
  and an explicit winner screen with return to lobby.
- Resolve member names through get-room and clear recovered polling errors.
- Stop reconnecting on CONNECTION_REPLACED without erasing shared room storage.
- Extend the development mock and client unit/component coverage.

## Capabilities

Modified: client/session, client/connection, client/game-screen. These deltas
supersede the overlapping requirements in client-stage-1-skeleton, including
its explicit prohibition on leaving. Integration must sync the original
client deltas before this change.

## Impact and Scope

Implementation is restricted to apps/client/**; this change also owns its
OpenSpec artifacts. No protocol/server/core implementation, economy, final
board layout, stage-8 abandonment behavior, new packages, or Playwright E2E
scenarios. Screenshots against the development mock are acceptance evidence.

## Sources

- TASK-s1-client-lobby revision 1 and Team Lead clarification of 2026-11-15.
- docs/efforts/stage-1-skeleton.md revision 3, criteria 1a-1c, 8-11.
- docs/efforts/stage-1-skeleton/design.md; openspec/config.yaml.
- ROADMAP.md stage 1 and accepted technical decisions.
- GAME-BREAKDOWN.md headings “Порядок ходов, ход и кости”, “Банкротство”,
  “Завершение игры и симуляция”, “MVP: что входит и что отложено”, and
  “Принятые технические границы и текущая реализация”. Only the accepted
  last-active-player winner rule is displayed; the client computes no rules.
- client-stage-1-skeleton and engine-resignation changes.
- origin/agent/task-s1-server-api:openspec/changes/server-api, planning
  dependency only; Apply waits for merged protocol or exact names relayed
  by the Team Lead, plus proposal approval and a fresh context.
