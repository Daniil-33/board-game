# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-shell-pages
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: TBD # main after TASK-vd-tokens merges
owner: team-lead
status: proposed
```

## Outcome

The screens outside the game board match the owner's design on desktop and
on phones, with identical behavior:
- login;
- lobby;
- waiting room;
- the turn-order roll.

## Acceptance criteria

1. **Login** per the design: the nickname, Russian texts and the validation
   message.
2. **Lobby** per "Лобби" (desktop) and the mobile lobby:
   - the room list with statuses (players/max, in progress, code
     required);
   - "Создать комнату" (max players 2-6, optional code) as a
     `ResponsiveDialog`;
   - "Войти по коду";
   - a disabled "Войти / профиль" placeholder with its reason.
3. **Waiting room** per "Комната ожидания":
   - seats as circles with empty places, the creator marked, player
     colors;
   - the invite link and the code, with "Скопировать" and a confirmation
     toast;
   - "Начать партию" (creator only, enabled at 2 or more players, with the
     disabled reason) and "Выйти" (creator leaving closes the room, with a
     confirmation `AlertDialog`).
   - There is no color picker unless the protocol supports it; if the
     design shows one, use a static player color and report it.
4. **Turn-order roll** per "Розыгрыш порядка ходов": a modal with avatars and
   large dice; the current roller, the timer (`Countdown`), re-rolls on ties
   and the auto-roll at the deadline. It renders from the view.
5. **Mobile** (360-430 px): every screen is usable with no horizontal
   scroll. Dialogs become bottom sheets.
6. **Behavior identical:**
   - stage 1-5 browser specs pass, with selectors via `data-testid`;
   - errors and disabled reasons are shown;
   - Russian texts come from keys.
7. **Accessibility:** focus and Esc work in every dialog; the copy action
   is reachable by keyboard; text contrast follows the token AA test.
8. **Evidence.** Screenshots of each screen at 1440x900 and 390x844 next to
   the design frames, in `/srv/agents/evidence/TASK-vd-shell-pages/`.

## Scope and non-goals

In scope:
- `apps/client/src/pages/{login,lobby,room}`;
- the turn-order widget;
- the related features and entities;
- tests and `e2e/**` (selectors and texts only);
- the OpenSpec client delta.

Not in scope: the game page layout, board, dialogs of the game, chat UI,
sound, server or protocol changes (escalate if a design element needs
one).

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C3, C4 and C11.
- `docs/efforts/visual-design/design.md`.
- `docs/design/ui-mvp-v1.html`, `docs/design/ui-mvp-mobile-v1.html`,
  `docs/design/ui-brief.md` § 2.

## Dependencies

Starts after `TASK-vd-tokens` merges, in parallel with `TASK-vd-board`.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, the client bundle and lint;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head.

## Escalation conditions

- A design element that needs a protocol or server change (for example a
  color picker).
- An owner-visible choice the designs leave open. Include a screenshot of
  the options.

## Deliverables

- branch `agent/task-vd-shell-pages`, the PR and CI evidence;
- the screenshots;
- the independent review report.

The Engineer accepts the exact revision before editing.
