# Tasks

## 1. Sound assets and engine

- [x] 1.1 Select CC0 source clips for each implemented sound id; convert to mono MP3 within 10–60 KB; add exact manifest entries and a validation test for ids, files, orphan assets, size and license. See `client/sound` · Every sound asset has verified metadata.
- [x] 1.2 Implement the gesture-gated lazy engine, settings persistence and four reserved silent ids; test with fake AudioContext, fetch and blocked storage. See `client/sound` · Playback starts only after interaction and failures are silent.

## 2. Event integration and controls

- [x] 2.1 Add pure `entities/event/sounds.ts` mappings and tests for relevant events and own/other filtering. See `client/game-screen` · Live game events have a sound mapping.
- [x] 2.2 Wire live-only chat and game event handlers, final auction seconds and token hops; ensure reduced motion skips token sounds and Welcome history is silent. See `client/game-screen` · History items never trigger sound.
- [x] 2.3 Add translated, keyboard-accessible mute and volume controls to desktop header and mobile “Ещё”; verify persistence and behavior. See `client/sound` · Sound settings are controllable.

## 3. Evidence and delivery

- [x] 3.1 Record the sound list and test log in `/srv/agents/evidence/TASK-vd-sound/`; measure initial and lazy JS chunks against `5181edd` with one Node zlib method and confirm audio is external hashed assets.
- [x] 3.2 Run `pnpm build`, `pnpm test`, lint, `openspec validate --all --strict`, and `git diff --check 5181edd`; record results. (Final `5181edd..HEAD` check is performed after commit.)
- [ ] 3.3 Open/update the task PR, start the independent review for its exact head, resolve findings, and archive this OpenSpec change after review passes.
