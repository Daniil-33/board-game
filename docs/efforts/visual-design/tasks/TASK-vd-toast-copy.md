# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-toast-copy
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 13e9f49 # main after TASK-vd-e2e (PR #98)
owner: team-lead
status: proposed
```

## Outcome

Rejected-action toasts and the reconnect banner match the design
(`docs/design/ui-mvp-v1.html`, frame "Рента, долги, ошибки, связь";
handoff criterion 3, "toasts for rejected actions, the reconnect banner").
Players no longer see raw protocol error codes.

## Defect (TL finding, 2026-11-19, from the TASK-vd-e2e screenshot pairs)

- Today a rejected house build shows
  `BUILD_QUOTA_USED: BUILD_QUOTA_USED — Дом уже построен в этом ходу.`
  The server's `message` field repeats the code, and the `hud.rejected_command`
  template is `{code}: {message} — {reason}`, so the code appears twice.
  `game_layout.command_rejected` and `HudStatus.vue` use the same pattern.
- The design toast has a title ("Нельзя построить дом", "Can't build a house")
  and the human reason underneath. It shows no code.
- The design banner has a second line, "Партия продолжается, таймеры идут"
  ("The game continues, timers are running"). The app shows only the first line.
- Evidence: `/srv/agents/evidence/TASK-vd-e2e/screens/build-quota-toast-*-app.png`
  and `reconnect-banner-*-app.png`, against the `-design.png` frames beside them.

## Acceptance criteria

1. **Toast text.** Rejected-command toasts (`app/CommandToasts.vue`) and
   HUD messages (`widgets/turn-header/HudStatus.vue`) show a title and the
   translated reason, and no raw code or server `message` string in visible text.
   - Titles: "Нельзя построить дом" for a rejected Build (as designed), and
     one per other command type the client can send, in the same "Нельзя
     <action>" form. Where no exact verb fits, use "Действие отклонено"
     ("Action rejected").
   - When no translated reason exists (unknown code), show the title plus
     "Попробуйте ещё раз" ("Try again"). The code stays out of visible text.
   - `data-code` stays on the element for tests and diagnostics.
2. **Banner.** The reconnect banner (`widgets/reconnect-banner/ReconnectBanner.vue`
   and the `HudStatus.vue` offline line) adds the second line "Партия
   продолжается, таймеры идут". English locale gets equivalent strings.
3. **Tests.** Unit tests cover the title per command type, the reason, the
   fallback, and the absence of the code in visible text. Existing browser
   assertions on `message[data-code=...]` keep passing.
4. **Screenshots.** Regenerate the `build-quota-toast` and `reconnect-banner`
   pairs with the TASK-vd-e2e producer (`E2E_SCREEN_EVIDENCE=1`, both
   viewports) on the PR head.
5. **Archive the e2e change (carry-over).** PR #98 merged with the OpenSpec
   change `vd-e2e-final-evidence` still active. In this PR, check its task 6,
   sync its two delta specs (`client/game-screen`, `client/logos`) into
   `openspec/specs`, and archive it to
   `openspec/changes/archive/2026-11-19-vd-e2e-final-evidence`.
6. **Collector provenance (RVW-018 carry-over).** `scripts/collect-visual-screens.mjs`
   takes the producer head from `capture-manifest.json` (or a sidecar file
   written by `captureScreens`) instead of its own checkout HEAD, and fails when
   the two differ.
7. **No other change.** No layout, token, protocol or server change.

## Scope and non-goals

In scope: `CommandToasts.vue`, `HudStatus.vue`, `ReconnectBanner.vue`,
`shared/i18n/locales/{ru,en}.json`, their tests, and an OpenSpec delta if the
game-screen spec states the toast format.

Also in scope: the `vd-e2e-final-evidence` archive and the collector provenance fix (criteria 5 and 6).

Not in scope: toast visual styling (already done by game-layout), other
design differences, server error messages.

## Dependencies

Base: main 13e9f49. Runs alone (host memory).

## Escalation conditions

A title wording that changes the meaning of a game rule, or a need to change
the server's `message` field: ask the Team Lead.

## Required workflow

Small atomic task: Explore -> Apply in the same context (TL records why) ->
Verify -> PR -> start the independent review yourself -> review fixes.
Archive any OpenSpec change in the PR once review passes, then request the exact-head review of the archived head.

**Do not merge.** The Team Lead merges through pr-merge-gate after accepting the exact head.

## Required checks

- `pnpm build`, `pnpm test`, lint, `pnpm typecheck:e2e`;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head;
- the bundle total stays at or below 343,863 B.

## Deliverables

- branch `agent/task-vd-toast-copy`, the PR and CI evidence;
- the regenerated screenshot pairs;
- the independent review report.

The Engineer accepts the exact revision before editing.
