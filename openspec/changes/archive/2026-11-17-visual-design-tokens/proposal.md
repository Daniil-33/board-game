# Proposal

## Why

The existing client has an English localization foundation and unshared presentation styles. The accepted visual design requires a common accessible design system and Russian presentation before screen-specific restyling.

## What Changes

- Introduce the design token source, Tailwind theme, Pixi adapter, fonts, accessible shared UI primitives and dev-only evidence page.
- Translate all client-owned text into Russian, default and fall back to Russian, retain English and locale discovery, and use locale-aware formatting.
- Enforce token use and correct the shared-segment boundary lint while retaining probes. Adopt primitives and tokens mechanically without redesigning screens.

## Capabilities

### New Capabilities
- `client/design-system`: design tokens, reusable accessible controls and development evidence.

### Modified Capabilities
- `client/localization`: Russian default, complete translations and locale formatting.
- `client/structure`: allow acyclic shared-segment imports through public APIs.

## Impact

Client, client lint, browser text assertions and client OpenSpec only. New pinned client dependencies and bundled fonts affect bundle size. Board rendering, screen layouts, chat, sound, server, protocol and game rules are outside scope. `GAME-BREAKDOWN.md` sections “MVP: что входит и что отложено” and “Принятые технические границы и текущая реализация” remain unchanged; money remains integer-valued and authoritative game behavior stays in the core.
