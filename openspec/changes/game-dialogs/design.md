# Design

## Context

See proposal.md for motivation and scope. The current `GameScreen` already binds widgets to authoritative `StateView`, forwards existing commands, and uses shared Reka-based `ResponsiveDialog`; most feature data and legality adapters exist. The remaining work is primarily presentation, accessibility integration, and surface-level coverage. The accepted visual contract is in `docs/efforts/visual-design/design.md` under “Component inventory”, “Breakpoints and layout”, “Logos”, “No behavior change”, and “Bundle size”.

## Goals / Non-Goals

**Goals:** implement the handoff's responsive surface mapping and view-backed content; retain current command, timer, amount, and legality behavior; prove the specified states and accessibility behavior; provide screenshots and bundle evidence.

**Non-Goals:** alter game rules, command/protocol/server contracts, page layout, board visuals beyond the tooltip mortgage refresh, or sound and later-stage UI.

## Decisions

- Reuse `ResponsiveDialog` for modal purchase and asset surfaces, and extend it only as needed for controlled visibility, mobile sheet presentation, and focus handling. Reka primitives remain responsible for focus containment; tests will verify actual outside-focus redirection, `aria-modal`, Escape policy, and focus return.
- Keep purchase and mobile auction response surfaces non-dismissible for the viewer who must answer. Other viewers may dismiss their modal/sheet so chat and room controls remain reachable; a viewer who becomes the auction responder gets the sheet reopened.
- Keep the auction's desktop placement in the centre column and use the same responsive dialog/sheet primitive only at mobile widths. Preserve `nextBidAmount`, `canIssue`, countdown calculation, and projected leader state.
- Keep all content sourced from `StateView`, catalog logo URLs, and game-core helpers. Reuse existing intent adapters for asset controls. Derive shortfall display only from projected rent and payer balance, with no mutation or command changes.
- **TL-approved scope extension:** add the pure additive `rentTiers(board, assetId)` game-core export because the existing `rentFor` accepts full `GameState`, while the client has only `StateView` and this task excludes core inputs. It derives the public schedule from board data only; shared multiplier constants keep `quoteFor` and the table aligned. No `rentFor`/`rentQuotes` behavior, `StateView`, protocol, or server contract changes. Energy tiers expose rent by dice sum rather than a fixed amount. The client highlights its current tier using only projected ownership, houses, and rent quotes.
- Track the opening source for asset inspection so dismissing the surface can restore focus to the originating board cell or portfolio control. The required responder's purchase/auction surface and rent payment remain non-dismissible with Escape; non-responders may dismiss purchase/auction presentation and asset inspection is dismissible.
- Refresh tooltip content when view-backed ownership or mortgage details change even when pointer position does not. Preserve the existing tooltip cleanup lifecycle.
- Keep component tests alongside each widget update. Retain existing `data-testid` hooks for browser specs and add hooks only where a missing observable is needed.

## Risks / Trade-offs

- **Modal changes may interfere with nested overlays or mobile navigation** → exercise open, update, close, and viewport states in component tests and at the two required screenshot sizes.
- **Current responsive dialog behavior may not return focus to non-button board origins** → use a documented focusable board/portfolio origin and test both entry paths.
- **Dialog content may consume the remaining bundle headroom** → measure each emitted JS/CSS file against the merge base; follow the accepted route-splitting rule if the effort budget threshold requires it.

## Migration Plan

No data or service migration. Ship as a client-only change behind existing view and command paths. Existing browser specs and selectors remain supported.
