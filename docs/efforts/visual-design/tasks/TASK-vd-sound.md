# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-sound
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: 5181edd # main after TASK-vd-game-dialogs (PR #89)
owner: team-lead
status: proposed
```

## Outcome

The game plays interface sound effects of a "medium" character (not soft
lo-fi, not loud arcade) for the events listed in handoff C10. Sound starts
only after the first interaction, is quieter and rarer for other players'
events, and has a global mute and volume control that is remembered per
browser.

## Acceptance criteria

1. **Files:**
   - one `.mp3` per sound id from design.md § Sound, mono, 10-60 KB each,
     in `apps/client/src/shared/sound/files/`;
   - CC0 sources only (Kenney, Freesound CC0);
   - `sounds.json` records `{ id: { file, source, sourceUrl, license:
     "CC0", author } }` for every file;
   - a test asserts the key set, file existence, no orphan files, the size
     cap, and `license === "CC0"`.
2. **Engine** (`shared/sound`):
   - `playSound(id, { own })` and a reactive `soundSettings { muted,
     volume }` stored in `localStorage`, with read and write wrapped so a
     blocked storage keeps the defaults;
   - one `AudioContext`, created on the first `pointerdown` or `keydown`;
     calls before that are dropped, not queued;
   - buffers are fetched lazily on first use and cached; a failed fetch or
     decode is silent and does not throw;
   - files are emitted as hashed assets, never inlined into JS.
3. **Own versus others:** another player's event plays at about −9 dB and
   only for `dice-roll`, `dice-double`, `purchase`, `auction-win`,
   `bankrupt`, `victory` and `chat`. Every other id plays only for one's
   own events.
4. **Triggers:** one mapping, `entities/event/sounds.ts`, turns core events
   and timer thresholds into ids:
   - `turn-start` when one's turn begins;
   - `turn-timeout` when one's turn time runs out;
   - `auction-tick` in the last seconds of the response timer, at most once
     per second;
   - `token-step` per step of the movement animation, skipped under reduced
     motion;
   - a new chat message from someone else plays `chat`; one's own does not.

   Widgets call `playSound` from event handlers only. Nothing plays on a
   reload or for history items from `Welcome`.
5. **Reserved slots:** `casino`, `chance`, `jail` and `trade-offer` exist as
   ids with no file. Playing them is a silent no-op, and a test proves it.
6. **Controls:** mute and volume in the top bar on desktop and in "Ещё" on
   mobile, with translated labels and keyboard access.
7. **Tests:**
   - the mapping table, event to id with own/others;
   - nothing plays before interaction;
   - mute and volume persist;
   - others' events are filtered and attenuated;
   - nothing plays for history.

   Use a fake `AudioContext`.
8. **Bundle:** the engine adds at most a few KB of initial JS, and the
   audio is fetched lazily. Report the per-chunk table against the merge
   base.

   Main at 5181edd is +81,963 bytes over the 253,863-byte baseline, which
   leaves about 3 KB before the +85 KB trigger. If this task's total JS
   goes above +85 KB, it must also split the game page and its dialogs
   into a lazy route chunk (design.md § Bundle size). Report initial-route
   and lazy JS separately. The hard cap is +90 KB.
9. **Evidence:** in `/srv/agents/evidence/TASK-vd-sound/`:
   - the sound list (id, trigger, file, source URL, author, license);
   - a short screen recording, or the test log, showing the sounds fire on
     the right events and respect mute.

## Scope and non-goals

In scope:
- `shared/sound/**`;
- `entities/event/sounds.ts`;
- the controls in the top bar and in "Ещё";
- the trigger call sites in widgets;
- locale keys and tests.

Not in scope:
- music;
- stage 6-7 sound files;
- any core, protocol or server change.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C10.
- `docs/efforts/visual-design/design.md` § Sound.

## Dependencies

Starts after `TASK-vd-game-dialogs` merges (base 5181edd), because the call
sites live in those widgets. Runs in parallel with `TASK-vd-dialogs-followup`,
which edits `widgets/purchase-card`, `widgets/auction-panel`, `rent.ts` and
the e2e helpers. Keep the sound call sites minimal there, and rebase if both
change the same files.

## Required workflow

Explore -> Propose (OpenSpec change; `agentctl engineer report --wake`) ->
Team Lead approval -> Apply in a fresh context -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive the OpenSpec change in
the PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, lint;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all four jobs) on the PR head.

## Escalation conditions

- No CC0 source fits an id in the "medium" character. Propose the closest
  candidates with links.
- Any paid or non-CC0 asset.

## Deliverables

- branch `agent/task-vd-sound`, the PR and CI evidence;
- the sound list and the recording or test log;
- the independent review report.

The Engineer accepts the exact revision before editing.
