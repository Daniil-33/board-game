## 1. Session screens

- [x] 1.1 Restyle guest login using localized labels, guidance and inline validation. Verify valid and invalid submissions at desktop and phone widths (client/session, Responsive guest entry).
- [ ] 1.2 Restyle the lobby, add room status and N/6 occupancy, and wire the create and locked-room dialogs through the existing session feature. Verify code rejection and correction, invite entry, disabled profile reason and keyboard dismissal (client/session, Lobby room actions and capacity).
- [ ] 1.3 Restyle the waiting room with six seats, player and creator markers, invite copy feedback, disabled Start reasons and a creator leave confirmation. Verify copy by keyboard, clipboard failure, cancel and confirm, and the two-player start threshold (client/session, Waiting room seats and controls).

## 2. Setup

- [ ] 2.1 Present setup in the responsive turn-order dialog through the turn-header widget. Verify current roller, roll availability, tie re-roll, automatic deadline progression, Esc and phase transition using the authoritative view (client/game-screen, Responsive turn-order roll dialog).

## 3. Verification and evidence

- [ ] 3.1 Add focused regression coverage and update stage 1–5 browser selectors and text expectations as needed, preserving the workflows. Exercise the flows and verify the token contrast test and no horizontal overflow from 360 to 430 px.
- [ ] 3.2 Capture all four app screens at 1440×900 and 390×844 under `/srv/agents/evidence/TASK-vd-shell-pages/` with the available design frames alongside them. Record the static player colors and reference gaps.
- [ ] 3.3 Run build, tests, client bundle and lint, strict OpenSpec validation, and the diff check against the task base. Open the PR and obtain four green CI jobs and independent review on the exact PR head. Record any known stage 3 flake recurrence with its trace and follow the handoff's archive and final-head verification sequence.
