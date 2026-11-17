# Design

## Context

The client already discovers locale files, enforces FSD boundaries and provides Intl wrappers; its current default is English. See the proposal and the Team Lead design for scope and accepted component mappings.

## Goals / Non-Goals

**Goals:** Establish a reusable theme and accessible primitives without changing game behavior. Preserve stable hooks and disabled reasons.

**Non-Goals:** Screen redesign, Pixi board rendering changes, server, protocol, chat and sound.

## Decisions

- Extract the desktop frame's computed styles in Chromium and confirm with the mobile reference; retain the extraction script and output as evidence. CSS custom properties are the single source; Tailwind maps them and the Pixi adapter reads computed values. Duplicating constants would risk drift.
- Pin Tailwind 4.1, its Vite plugin, Reka 2 and the two variable font packages to patches at least two weeks old; import only Latin and Cyrillic fonts once in app. Use Reka wrappers for keyboard behavior rather than bespoke modal focus management.
- Provide a responsive dialog using the same accessible dialog behavior at the 1024px breakpoint; retain the existing screen structure and replace controls only mechanically. Toast provider belongs in app. Test focus, Escape and disabled reasons at component level.
- Keep JSON locale discovery and English; make Russian default/fallback and translate every key. Use Intl wrappers with Russian grouping and update coverage and browser assertions. Keep the selector path hidden under the handoff's two-locale condition.
- Adjust lint to allow only acyclic public-index shared segment dependencies and forbid imports from i18n to other segments; retain positive and negative probes. Enforce raw-color prohibition outside config.
- Capture the development-only `?ds` page at both specified sizes beside the design frame. Compare build gzip sizes to the foundation baseline and report the effort budget consumption.

## Risks / Trade-offs

- Design colors may fail AA → measure designated pairs and escalate the specific token rather than silently changing the accepted design.
- Dependency size or fonts may consume the effort budget → measure gzip and subsets before delivery.
- Mechanical substitutions may affect behavior → run existing tests and verify disabled reasons and screen interactions.

## Migration Plan

Ship as a client-only change; rollback by reverting the client deployment. No persistent data migration is required.
