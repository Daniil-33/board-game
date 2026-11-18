# Design

## Context

`shared/sound` is currently a type-only no-op. `GameScreen` owns the active game view and mobile “Ещё” panel; `Hud` renders the game header; `EventFeed` receives merged live and Welcome history items; `AuctionContent` owns the displayed response timer; `BoardCanvas.play` owns ordered dice and token animation steps. The Team Lead design requires widgets to invoke audio only for live event handlers, never when displaying Welcome history.

The implementation follows `docs/efforts/visual-design/design.md` § Sound and `docs/efforts/visual-design/tasks/TASK-vd-sound.md` revision 1. Kenney’s Interface Sounds is an appropriate CC0 asset source ([official pack page](https://kenney.nl/assets/interface-sounds)); final per-file choices and metadata will be recorded in `sounds.json` and the evidence list.

## Goals / Non-Goals

- Add one lazily-created `AudioContext`, first-use fetch/decode caching, reactive persisted settings, silent failure behavior, and a user-gesture gate.
- Centralize core-event to sound-id ownership mapping in `entities/event/sounds.ts`; keep animation and timer threshold callbacks at their existing widget event boundaries.
- Keep every file mono MP3, 10–60 KB, and emitted as an external hashed asset.
- Do not add music, core/protocol/server changes, product rules, or stage 6–7 sound files.

## Decisions

1. Keep the sound engine dependency-free in `shared/sound`. Resolve static file URLs through Vite URL imports so they are hashed and emitted, while loading/decode remains deferred until `playSound`. Reserved ids have no URL and immediately no-op. Injectable platform primitives will allow fake AudioContext, fetch, and storage tests without changing runtime behavior.
2. Install gesture listeners at app startup. The first `pointerdown` or `keydown` creates the context; if it remains suspended, `pointerup`, `keyup`, `touchend`, `click` and later playback attempts retry `resume()` until the context runs. A sound request made while the context is suspended is dropped immediately, so it cannot play later as a stale queued sound. Catch storage access, request, decode, and playback failures. Use a master gain node for mute and volume; multiply other-player allowed events by `10 ** (-9 / 20)`.
3. `entities/event/sounds.ts` is a pure mapping from projected core event and viewer id to `{id, own}`. Timer tick gating tracks auction identity and integer seconds, and only emits once per second in the final three seconds. Token-step audio is emitted per hop and omitted when reduced motion is requested.
4. Do not feed the merged historical journal into sound mapping. Consume only live `Update` event deliveries and live `Chat` messages; compare event actor ids with the current viewer. This prevents reloads and Welcome history from producing sound.
5. Place the desktop control in the game header and reuse the control component in the existing `game-sound-slot` under mobile “Ещё”. Use translated labels, native buttons/range input, and state-driven `aria` text.
6. If asset inspection finds that no CC0 candidate fits a required id in the accepted medium character, stop before using a non-CC0 asset and ask the Team Lead with candidate links, as required by the handoff.

## Risks / Trade-offs

- Browsers may reject autoplay or decoding: those paths must remain silent and non-throwing.
- Short files may need trimming or re-encoding to meet the 10–60 KB limit; the source URL and author remain the original pack provenance, and the evidence list records the selected source filenames.
- The visual character of the full set is subjective; keep choices restrained and coherent with the accepted “medium” direction.
- Sound engine JS must remain a few KB and all MP3s stay out of initial JS. Measure all emitted JS chunks against base `5181edd` with Node zlib.
