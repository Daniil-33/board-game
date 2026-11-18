# Proposal

## Why

The client currently has a no-op sound module. The accepted visual-design handoff adds restrained event sounds, browser-persisted controls and named extension slots while requiring no sound before a user gesture.

## What Changes

- Add the lazy Web Audio engine, CC0 sound manifest and hashed audio assets.
- Map live game events, auction timer thresholds, token animation steps and incoming chat to sound ids, with ownership filtering.
- Add accessible mute and volume controls to the desktop game header and the mobile “Ещё” panel.
- Test asset provenance metadata, event mapping, browser audio behavior, persistence, filtering, attenuation and history silence.

## Capabilities

### New Capabilities

- `client/sound` — Lazy, gesture-gated, locally configurable interface sounds.

### Modified Capabilities

- `client/game-screen` — Live event and animation sounds and desktop/mobile sound controls.

## Impact

Changes are limited to `apps/client` shared sound, event entity, game widgets, locale, tests, and this OpenSpec change. No game-core, protocol, server, music, or stage 6–7 sound implementation changes. Product behavior and event semantics follow the accepted `EFF-visual-design` revision 2 and `design.md` § Sound; no rules are added.
