# Team Lead -> Engineer Task Handoff

```yaml
id: TASK-s6-client
revision: 1
effort: EFF-stage-6-special-cells
project: economic-board-game
source_commit: f402920 # main after TASK-s6-core-cells (PR #117); rebase on current main before the PR
owner: team-lead
status: proposed
```

## Outcome

Players can play stage 6 in the accepted visual design (handoff C17). On desktop at 1440x900 and on mobile at 390x844, the client shows:
- the casino bet dialog and its result;
- the chance card, to every player;
- the prisoner's choice and the jail status;
- the bank charge as a payable debt;
- the redeem-lock reason.

It sends `PlaceCasinoBet`, `DeclineCasino`, `PayJailFee` and `PayCharge`. Core, protocol and server are done (PRs #115 and #117, `core-9`).

## Acceptance criteria

Product (handoff C16, C17; design § "Client"; frame `desktop-08-тюрьма-казино-шанс` in `docs/design/ui-mvp-v1.html`):

1. **Jail choice.** Shown on your own turn, in jail, before the roll.
   - Card "Вы в тюрьме", subtitle "Попытка N из 3", with an attempt bar as in the frame.
   - Primary "Бросить на дубль" sends `RollDice`.
   - Secondary "Заплатить X и выйти" sends `PayJailFee`, where `X = jailFee(view.economy)`. It is disabled with a visible reason when cash < X, and the player may still mortgage or sell first.
   - The text explains the third attempt: "После третьей неудачи вы заплатите и пойдёте."
2. **Jail status, for every viewer.**
   - The jail marker on the token.
   - The jail marker in the players panel.
   - "В тюрьме · попытка N из 3" in the turn header. It exists today; keep it consistent.
3. **Casino.** Shown on your own turn while `view.casino` is yours.
   - Card "Казино · Шанс 50/50 · ставка по желанию" and "Ставка · до X", where `X = min(casinoCap(view.economy), cash)`.
   - A stepper (−/+) in steps of 10 within `[10, X]`, plus a numeric field. Show the win and loss preview: "Выигрыш: +A", "Проигрыш: −A".
   - "Сделать ставку" sends `PlaceCasinoBet {amount}`. "Не играть" sends `DeclineCasino`.
   - When X < 10, or a payment is open: the bet button is disabled with a reason, and "Не играть" stays.
   - Other players see a non-modal status: "Игрок N в казино…".
   - On `CasinoResolved`, every viewer sees a result animation (win or loss and the amount).
4. **Chance.** On `ChanceDrawn`, every viewer sees the card flip from the frame: the signed amount and "±5% / ±10% стартового капитала".
   - A gain shows who was credited.
   - A loss shows "К оплате X" and leaves an open `charge`.
5. **Bank charge.** While `view.charge` is open for you, show it with the existing rent-card payment pattern:
   - pay with `PayCharge`;
   - "Управлять своими активами" (mortgage or sell allowed; build and redeem show `PAYMENT_PENDING`);
   - the shortfall and the automatic-settlement note, as for rent.

   The other players see the non-modal status.
6. **Redeem lock.** The "Выкупить" button is disabled with "Выкуп доступен со следующего хода" when `mortgages[id].lockedTurnId === view.turn.turnId`. Use the existing reason plumbing (`MORTGAGE_REASONS.REDEEM_LOCKED`).
7. **Journal.** The new events read naturally in Russian, with English locale parity.
   - **RVW-005 (carried):** chance cards show localized, signed labels ("+5% капитала, +1 490" / "−10% капитала, −2 990"), not raw ids.
   - Casino and jail events are worded consistently with the cards.
8. **Layout.** Desktop at 1440x900 and 1920x1080 has no page scroll. Mobile at 390x844 works, with these surfaces in the existing bottom-sheet pattern (`game-dialogs`).
   - Mobile has no design frame for them; list that as a deviation in the PR body.
   - Animations respect `prefers-reduced-motion`.
   - Sound: use existing cues only, if they fit. No new sound assets.
9. **Carried docs fix (RVW-006).** In the canonical `openspec/specs/engine/economy/spec.md` (around lines 28 and 34), and the second engine spec named in REV-s6-core-cells-round2, reword "Interim jail release" to "jail release", via this task's OpenSpec delta.

Technical proof:

10. **Client unit tests:**
    - each surface's availability and reason for every gating state (in jail before or after the roll, cash < fee, casino X < 10, payment open, redeem locked);
    - the command each button sends;
    - stepper bounds and rounding to steps of 10;
    - journal text for every new event in ru and en.
11. **Browser (desktop and mobile):** the existing fixture or seeded stacks may get new fixtures for these states, from `apps/server/src/test-fixtures.ts`. A smoke check per surface:
    - jail choice → pay → normal roll;
    - casino bet and decline;
    - a chance loss, then `PayCharge`;
    - redeem disabled with its reason.

    The full scenario set is TASK-s6-e2e. Keep it to a smoke check per surface here.
12. **Bundle.** Measure with the TL method: node:22, `pnpm --filter @game/client run build:bundle`, per-file gzip -9 over `apps/client/dist/assets/*.js`.
    - Baseline at `f402920` and the PR head, by the same method, both in the PR body.
    - The effort cap is 343,863 B. If the head exceeds it, say so explicitly and ask the TL before the PR. Do not trim unrelated code.
13. **Checks:** `pnpm build`, `pnpm test`, client lint, `openspec validate --all --strict`, CI 4/4 on the exact head, and the stage 3-5 browser suites green.

## Scope and non-goals

In scope:
- `apps/client`: widgets, features and entities for the surfaces above, locales, and tests;
- `apps/server/src/test-fixtures.ts`: new named fixtures only, if needed;
- e2e smoke specs;
- the OpenSpec change `s6-client`, which also carries RVW-006.

Not in scope:
- core, protocol and server behaviour (done);
- the seven completion browser scenarios and design-pair evidence (TASK-s6-e2e);
- new sounds;
- the visual-design follow-ups (CI bundle check, journal dimming, the "В лобби" exit, TBT, logos).

## Canonical references

- `docs/efforts/stage-6-special-cells.md` rev 1 (C16, C17).
- `docs/efforts/stage-6-special-cells/design.md` § "Client".
- `docs/design/ui-brief.md` § 6.6, `docs/design/ui-mvp-v1.html` (frame "Тюрьма, казино, шанс"), and the design tokens.
- `core-9` exports: `jailFee`, `casinoCap`, `StateView.casino`, `charge`, `jail`, `mortgages[].lockedTurnId`, and the event payloads (`packages/game-core/src/special-cells.ts`).
- The accepted client patterns from EFF-visual-design: rent panel, debt notices, `game-dialogs`, the reason plumbing.

## Constraints and invariants

- Client gating must match the core's guard order. Never enable an action the core rejects; never disable one it accepts.
- Use Feature-Sliced Design, Tailwind tokens and Reka UI. Keep the existing layout invariants: no page scroll on desktop; the journal and overlay rules accepted in PR #112.
- **Records rule (CTO, 2026-11-20):** handoffs, archived OpenSpec changes and earlier briefs change only through a new revision, never through a scrub or rename pass. Cleanups touch canonical specs, code and current docs only.

## Dependencies

- Upstream: TASK-s6-core-cells, merged as `f402920`.
- Downstream: TASK-s6-e2e uses these surfaces and their test ids. Keep stable `data-testid`s, and list them in the PR body.

## Delegated decisions

The Engineer decides:
- component structure and names;
- animation implementation (CSS or Pixi);
- exact copy beyond the strings named above, following the design and existing tone;
- fixture names.

Return to the TL:
- any product wording not covered by the frame or brief that changes meaning;
- any gating disagreement with the core;
- going over the bundle cap.

## Required workflow

1. Explore.
2. Propose the OpenSpec change `s6-client`.
3. Apply in a fresh context after TL approval.
4. Verify.
5. Open the PR.
6. Independent review; the request requires the full 40-char head SHA in the verdict block.
7. Review fixes.

Archive the OpenSpec change in the PR before the final exact-head review. **Do not merge.** Standing test permissions: `CURRENT_RULES_VERSION` and `PROTOCOL_VERSION` constants, and additive coverage rows for new codes. Every other change to an existing test needs TL approval first. List each change in the PR body.

## Required checks

Everything in criteria 10-13. In the PR body:
- app screenshots of each surface at 1440x900 and 390x844, beside frame `desktop-08`;
- the mobile deviation note;
- the test-id list;
- the bundle numbers.

## Escalation conditions

Escalate to the TL if:
- the core view lacks data a surface needs;
- a stage 3-5 browser test must change;
- the bundle exceeds the cap;
- the mobile layout cannot fit a surface without page scroll.

## Deliverables

- The branch `agent/task-s6-client` and its PR.
- The archived OpenSpec change.
- Screenshots and test evidence.
- The independent review report.
- Residual risks.
