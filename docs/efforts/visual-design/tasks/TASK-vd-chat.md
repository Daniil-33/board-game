# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-vd-chat
revision: 1
effort: EFF-visual-design
project: economic-board-game
source_commit: c848122 # main after TASK-vd-fsd (#75) and TASK-vd-logos-set (#78)
owner: team-lead
status: proposed
```

## Outcome

1. **CI split, first and as its own PR.** The browser job splits so that
   stages 6-7 have room.
2. **Chat and history, the second PR:**
   - room chat (server, protocol and client data layer);
   - the `Welcome` frame carries the viewer's recent event and chat history,
     so the event log and chat survive a reload.

No visual UI: the feed widget comes in `TASK-vd-game-layout`.

## Acceptance criteria

### PR 1: CI split (C12)

1. `compose-browser` becomes two parallel jobs in `.github/workflows/ci.yml`:
   - `compose-browser`: the production stack scenarios;
   - `compose-browser-fixtures`: the isolated fixture stack (stage 4 and 5
     specs).

   `compose-browser-seeded` stays. Each job has its own evidence artifact,
   sanitization and teardown.
2. The staging deploy still runs only after the whole CI workflow succeeds,
   so the new job gates it as well. Verify this in the deploy workflow
   trigger and state it in the PR.
3. Report the per-job durations on the PR head. Each browser job should
   stay under about 20 minutes.

### PR 2: Chat and history (C7)

4. **Protocol** (`PROTOCOL_VERSION = 6`):
   - client frame `ChatSend { clientMsgId, text }`;
   - server frames `Chat { message: { seq, authorId, text, at } }` and
     `ChatAck { clientMsgId, ok, reason? }`;
   - `Welcome` gains `history: { events, chat }`.

   All are validated by the existing decoders and checkers.
5. **Server.**
   - **Members:** any room member (players, including eliminated ones) may
     send. Non-members are rejected.
   - **Validation** (design § "Event log and chat"):
     - trimmed text of 1-300 characters;
     - no control characters except newline;
     - at most 4 lines.
   - **Rate limit:** 5 messages per 10 s per player and a 500 ms minimum
     interval. Each rejection reason has its own code.
   - **Order:** persist, then broadcast `Chat` to every connection of the
     room, then `ChatAck ok`.
   - **Storage:** migration `0007` creates `chat_messages` (`room_id` FK,
     `seq` unique per room, `author_id`, `text`, `created_at`).
   - **Boundaries:** chat never enters the core, its log or its replay.
6. **History.**
   - `Welcome.history.events` holds the visible events of the room's last
     200 log entries, filtered for the receiving viewer by the same
     per-viewer event projection the `Update` path uses.
   - `Welcome.history.chat` holds the last 200 messages.
   - It works after a restart and for finished rooms.
7. **Client data layer only:**
   - an `entities/chat` store (messages ordered by `seq`, deduplicated);
   - a `features/send-chat` action (client message id, pending/ack/reject
     state);
   - `entities/event` receives `history.events` once on `Welcome` without
     replaying animations;
   - no new widgets.
8. **Tests:**
   - protocol decoder tests;
   - server integration with 3 guests: a message reaches every guest; an
     eliminated player can write; a non-member is rejected; each validation
     and rate-limit reason; persistence before broadcast; history after a
     reload and after a restart; history hides what the viewer's projection
     hides;
   - client store tests.

## Scope and non-goals

In scope:
- `.github/workflows/ci.yml` (PR 1);
- `packages/protocol/**`;
- `apps/server/**` and migration `0007`;
- `apps/client/src/entities/chat`, `entities/event` and
  `features/send-chat`, plus the connection glue in `shared/api`;
- tests;
- the OpenSpec deltas.

Not in scope:
- chat or feed UI;
- event-to-text mapping (`TASK-vd-game-layout`);
- moderation beyond length and rate limits;
- core changes.

## Canonical references

- `docs/efforts/visual-design.md` revision 2, C7 and C12.
- `docs/efforts/visual-design/design.md` § "Event log and chat" and § "CI
  split".
- `openspec/specs/server/*`, `openspec/specs/protocol/*`,
  `openspec/specs/client/*`.

## Constraints

- Persist before broadcast.
- One room per process, with commands and chat handled sequentially.
- The core stays deterministic, and chat is outside it.
- Staging stays playable after each PR.

## Dependencies

None. It starts now, in parallel with `TASK-vd-tokens`. The client part
touches only entities, features and `shared/api`, not styling.

## Required workflow

Explore -> Propose (OpenSpec change covering PR 2; PR 1 can go first after a
short plan) -> Team Lead approval -> Apply -> Verify -> PR -> start the
independent review yourself -> review fixes. Archive each OpenSpec change in
its PR once review passes.

## Required checks

- `pnpm build`, `pnpm test`, `pnpm test:integration`, the client lint;
- `openspec validate --all --strict`;
- `git diff --check <base> HEAD`;
- green CI (all jobs) on each PR head.

## Escalation conditions

- A history filtering question where the existing per-viewer projection
  does not decide.
- A transaction or recovery conflict.

## Deliverables

- two PRs (`agent/task-vd-ci-split`, `agent/task-vd-chat`) with CI evidence;
- the independent review reports;
- residual risks.

The Engineer accepts the exact revision before editing.
