# Stage 4 evidence

Run from the repository root, using a disposable Compose project and fresh volume:

```sh
export POSTGRES_PASSWORD=local-disposable-password WEB_PORT=8082
docker compose -p s4-fixtures -f docker-compose.yml -f docker-compose.fixtures.yml up --build -d --wait
E2E_FIXTURES=1 E2E_BASE_URL=http://127.0.0.1:8082 \
  E2E_FIXTURE_RESTART_COMMAND='docker compose -p s4-fixtures -f docker-compose.yml -f docker-compose.fixtures.yml restart server' \
  pnpm test:e2e e2e/stage4.spec.ts --output=test-results/fixtures
python3 scripts/sanitize-artifacts.py test-results playwright-report
docker compose -p s4-fixtures -f docker-compose.yml -f docker-compose.fixtures.yml down -v
```

Never enable this override in staging or production. No E2E_TEST_SEED is set;
movement uses real server CSPRNG dice. Stage 1–3 tests and their existing seed
remain unchanged and run on their original stacks.

The existing test-only `POST /api/test/fixtures` loader accepts
`{ fixture, tokens: [guestToken, ...] }` and returns `{ roomId }` (201).
The loader, guards and persistence are unchanged. The builder genesis uses seed
42 only for the board/setup; it does not control subsequent dice. Named fixtures:

- `pre-roll-regular-rent`, `pre-roll-shortfall`: all but one monopoly asset per group belong to the opponent;
  incomplete groups, no houses. Shortfall starts the mover at 10.
- `pre-roll-full-group-rent`: opponent owns all monopoly groups, no houses.
- `pre-roll-logistics-rent`: opponent owns exactly two logistics holdings.
- `pre-roll-energy-rent`: opponent owns both energy holdings; no synthetic dice sum.
- `pre-roll-own-asset`, `bonus-building`: mover owns every asset. Bonus-building retries until a real double, then builds
  in that turn and again in its bonus turn (at most 100 fresh fixtures).
- Existing post-landing `regular-rent`, `full-group-rent`, `logistics-rent`,
  `energy-rent`, `own-asset`, `shortfall`, and pre-roll `building` remain unchanged.
- `open-rent`: an already open regular settlement, retained for reload/restart.

Pre-roll fixtures place the mover seven cells before the target kind. A miss
retries a fresh fixture, at most 100 times, rather than forging a roll or walking
randomly through purchase/auction turns. Shortfall accepts only a landing where
the projected balance is below rent (a start reward can otherwise remove it).
Each accepted scenario uses three separate guest/browser contexts. Projection,
public events, visible amounts, controls and balances are asserted on every
client. Energy compares displayed sum with the actual DiceRolled dice. Deadline
checks use the saved turn target/deadline, and restart must reconnect all clients
before the settlement expires. Scenario logs record real-roll attempt counts in
the Playwright report. Existing helpers sanitize every trace before attaching.

Illegal-build probes dispatch the disabled button's click event through its
actual Vue handler and command queue. This bypasses only the DOM disable guard,
so the server rejection is associated with a real pending command and the
normal client Ack handler displays the reason. No server frame is fabricated.
