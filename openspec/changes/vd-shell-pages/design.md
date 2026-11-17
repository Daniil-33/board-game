# Design

## Context

The login, lobby and room pages already use the client-session feature for authentication, polling, invite handling, room lookup and lobby operations. The turn-header widget derives setup entries, the active player, deadline and action availability from the authoritative game view. See the proposal for scope and references.

## Goals / Non-Goals

Reuse the shared design tokens, localization and Reka primitives across the affected screens. Keep existing session and game state ownership in the client feature, server and engine. Limit work in the game screen to integrating the setup widget through the existing turn-header path.

## Decisions

- Keep forms and dialog state local to their pages. Reuse the nickname normalizer, existing room operations and protocol access-code validation. Put creation and locked-room entry in `ResponsiveDialog`. A room-row action can open the same locked-room dialog with that room selected. Preserve poll recovery, invite retry and dismissal, and foreground error precedence.
- Use the existing six-seat contract for counts, empty seats and locked-room eligibility. Apply a static token palette to the displayed player identities. Show creator access details when supplied by the existing create flow and use `Toast` for successful clipboard writes alongside the selectable link and failure feedback. Use `AlertDialog` for creator leave and responsive sheet presentation on phones. Keep direct leave for other members.
- Compose the setup dialog in the turn-header widget from its existing player order, name, color, deadline and action availability inputs. Use `Countdown` and the existing command path. Render one setup action and one setup roster so selectors and keyboard focus remain unambiguous. Keep an accessible reopening control during setup after Esc and return focus to a logical control when the phase advances.
- Apply the existing shared breakpoint, tokens and disabled-reason patterns. Use the desktop lobby, waiting-room and setup frames, and the mobile lobby and room frames. Apply the same visual language to login and the mobile setup sheet using the brief and shared components. The supplied exports have no standalone login frame or mobile setup frame. Capture the requested app views and document the available reference frame for each comparison.

## Risks / Trade-offs

- A poll may change a room while a guest enters a code. Submit through the existing authenticated client path and surface any server rejection in the dialog.
- Long nicknames, room IDs and links can overflow at phone widths. Verify wrapping and keyboard access in real browser evidence at both the specified capture sizes and the narrowest phone width.
- Setup can advance while a dialog has focus. Verify focus restoration and close the dialog when the authoritative phase moves on.
