# Tasks

## 1. Game presentation

- [ ] 1.1 Implement the page grid and mobile tabs per Responsive game layout. Test tab continuity across updates and preserve the board mount, legacy test hooks and dialog actions.
- [ ] 1.2 Update the roster per Public player balances. Test seat colors, house counts, debt, current turn, elimination and paused status.
- [ ] 1.3 Recompose the turn header per Responsive game layout and Public player balances. Test the translated paused label, including a zero remaining time, and preserve setup, dice and timer behavior.
- [ ] 1.4 Build My Turn from existing action controls per Turn and asset panels. Verify primary, secondary and danger presentations and desktop and mobile disabled reasons.
- [ ] 1.5 Build My Assets per Turn and asset panels. Test disabled reason mapping and verify each existing command binding, house pips, mortgage state and logo fallback.

## 2. Journal and connection feedback

- [ ] 2.1 Assemble the journal at the existing session callbacks per Combined event journal and chat. Test history timestamps, live arrival order and duplicate chat delivery.
- [ ] 2.2 Describe projected events and implement the journal list per Combined event journal and chat. Verify unknown event handling, translated content, unread indication and scroll preservation.
- [ ] 2.3 Build the composer per Combined event journal and chat. Test validation boundaries and translated acknowledgement rejections. Verify sending for eliminated members and member spectators.
- [ ] 2.4 Implement the app toast provider per Command rejection and reconnect feedback. Test the cap and error translation.
- [ ] 2.5 Implement the reconnect banner per Command rejection and reconnect feedback. Test the status role and dismissal after Welcome.

## 3. Verification and delivery

- [ ] 3.1 Run the automated no-overflow check at the six widths in Responsive game layout and run the Stage 1–5 browser specs using compatible hooks.
- [ ] 3.2 Run pnpm build, pnpm test, hex/boundary/i18n lint, strict OpenSpec validation and git diff --check against the merge base.
- [ ] 3.3 Record the merge-base and candidate gzip JS and CSS per chunk, identifying initial-route JS. Capture 1440×900 and all four 390×844 tab views next to the design frames in the task evidence directory.
- [ ] 3.4 Open the PR with the brief-vs-rules gaps, report all four CI jobs on its head, request independent review, address findings and archive the OpenSpec change as required by the handoff.
