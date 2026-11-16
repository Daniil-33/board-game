# Tasks

## 1. Intent selectors and purchase UI

- [ ] 1.1 Extend existing view selectors and command expectations for Purchase and auction intents, Action buttons follow the view and Timer from the server deadline; verify focused selector/connection tests and client typecheck against integrated stage 3 protocol.
- [ ] 1.2 Add PurchaseDialog and wire GameScreen for Purchase decision display; verify component tests for deciding/other/eliminated viewers, equal/below price, pending/disconnected/expired states and emitted intent.

## 2. Auction UI and timer

- [ ] 2.1 Add AuctionPanel and wire GameScreen for Auction participation display; verify component tests for responder/read-only roles, start/raise amounts, affordability, deadline changes, zero timer, and PlayerResigned-only projection changes.
- [ ] 2.2 Update existing TurnTimer/Hud for Timer from the server deadline and Action buttons follow the view; verify paused zero remainder, auction disables Roll/End and turn resume follows new deadline.
- [ ] 2.3 Extend existing connection/component tests for Purchase and auction intents; verify response target IDs, null payloads, rejected Ack errors, unchanged view after accepted Ack and Welcome restoration.

## 3. Ownership

- [ ] 3.1 Extend existing BoardScene and adapter for Projected owner markers; verify marker colours and refresh without board regeneration, during pending movement and after Welcome.
- [ ] 3.2 Extend existing AssetCard and screen wiring for Asset inspection owner display; verify free, owned and changed-owner cases including an already open card.

## 4. Mock scenarios

- [ ] 4.1 Extend existing mock scripts/server automation for Purchase decision display and Auction participation display; verify decoded scripted decision, outbid/pass/timeout, won and unsold sequences with expected next amounts, using PROTOCOL_VERSION fixtures.

## 5. Integration evidence

- [ ] 5.1 Run pnpm build, pnpm test, client vite build, openspec validate --all --strict and git diff --check; record outputs and compare final diff to every handoff criterion.
- [ ] 5.2 Capture mock purchase dialog, auction panel and owner-marker screenshots in /srv/agents/evidence/TASK-s3-client/ and record paths outside Git.

## Workflow follow-up

- Report proposal through agentctl and await Team Lead approval before Apply, in a fresh context as required by autonomy policy.
- Rebase current main, record external-operation intent, push branch, verify and confirm, open PR with the same protocol, request independent review through agentctl.
- Resolve findings, archive this change in the PR after review passes as required by the handoff, and rerun relevant checks; obtain green CI for the exact final head and Team Lead acceptance.
