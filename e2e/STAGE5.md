# Stage 5 evidence

Stage 5 runs on the same disposable fixture stack as stage 4 (see
[STAGE4.md](STAGE4.md)); both specs run in one Playwright call:

```sh
export POSTGRES_PASSWORD=local-disposable-password WEB_PORT=8082
STACK='docker compose -p s4-fixtures -f docker-compose.yml -f docker-compose.fixtures.yml'
$STACK up --build -d --wait
E2E_FIXTURES=1 E2E_BASE_URL=http://127.0.0.1:8082 \
  E2E_FIXTURE_RESTART_COMMAND="$STACK restart server" \
  E2E_FIXTURE_SQL_COMMAND="$STACK exec -T -e PGOPTIONS=-cdefault_transaction_read_only=on db psql -U game -d game -At" \
  pnpm test:e2e e2e/stage4.spec.ts e2e/stage5.spec.ts --output=test-results/fixtures
python3 scripts/sanitize-artifacts.py test-results playwright-report
$STACK down -v
```

`E2E_FIXTURE_SQL_COMMAND` is test-only. It reads one SQL statement on stdin
and prints rows; the winner scenario sends a single `SELECT` of its
`game_results` row, and the session is read-only. It runs inside the database
container over the local socket, so no credential appears in the command,
the report or the traces.

No seed changes: stage 1-3 specs and their seed stay on their original
stacks. Dice stay real (server CSPRNG); stage 5 scenarios need no roll
outcome. Each scenario starts from a named test-only builder in
`apps/server/src/test-fixtures.ts`, uses three guest/browser contexts and
asserts the projection, the public events and the visible UI on every client.
Commands are sent only inside the saved turn window (45 s from the fixture
load); screenshots come after the asserted step.

| Scenario | Fixture | What a real command does |
|---|---|---|
| Mortgage, then redeem | `mortgage-expiry` | Redeem, Mortgage, Redeem on the owner's asset: button amounts, rent quote 0 and back, terms "8 laps left", disabled reasons |
| Expiry | `mortgage-expiry` | Seven laps are counted in the fixture; the owner's real `EndTurn` closes the eighth, the asset becomes free, the advance stays |
| Liquidation | `liquidation-tier-1`, `-tier-2`, `-tier-3`, `liquidation-multi-tier` | `PayRent` above cash: steps in order, raised and paid in the notice, then `RentPaid`. Multi-tier: tier 1 mortgage, tier 3 house sale, tier 3 mortgage of the now bare asset; Redeem shows "Pay the rent first." during the open rent |
| Bankruptcy | `bankruptcy-houses` | The house is sold, the creditor gets cash plus refund, the rest is written off, the assets are free with no houses; the bankrupt client shows the elimination line and receives the next player's real roll |
| Resignation | `liquidation-tier-3` | The payer resigns during the open rent; assets and houses are free on every client, no rent is paid |
| Winner | `final-bankruptcy` | The last bankruptcy ends the game: winner, elimination order with reasons and final balances on all clients, after a reload of every tab, and equal to the `game_results` row |
| Restart | `mortgage-restart` | A server restart keeps both mortgages and terms; the next real `EndTurn` expires one and moves the other's lap on |

New test-only builders (unit-tested in
`apps/server/src/__tests__/stage5-fixtures.test.ts`, checked by core
invariants): `liquidation-multi-tier` and `bankruptcy-houses`. Both put one
house on the creditor's rent asset so the debt exceeds what several
liquidation steps raise; the payer's cheapest group has one house on its first
asset and every sibling mortgaged.
