## Purpose

Keep client dependencies reviewable and automation stable during incremental visual-design work.

## ADDED Requirements

### Requirement: Enforced client boundaries
The client SHALL use app, pages, widgets, features, entities and shared layers in descending dependency order. Cross-slice imports SHALL target public index.ts APIs and SHALL target lower layers only. CI SHALL reject violations, including type-only imports.

#### Scenario: Forbidden dependency
- **WHEN** a lower layer imports a higher layer or an import crosses a slice through a private file
- **THEN** the client boundary check fails

#### Scenario: Internal slice dependency
- **WHEN** a module imports another module within its own slice
- **THEN** relative private imports are permitted

### Requirement: Stable browser hooks
Every element selected by browser or component tests SHALL expose a stable data-testid. Browser tests SHALL select these hooks instead of depending on presentation markup or label text, while preserving behavioral assertions.

#### Scenario: Existing game interaction
- **WHEN** the stage 1–5 scenarios exercise the restructured client
- **THEN** the same interactions and assertions succeed using stable hooks

### Requirement: Inert sound slot
The client SHALL expose an unused sound slot with no playable sound identifiers and a no-op playback function.

#### Scenario: Slot has no effect
- **WHEN** the sound module is imported
- **THEN** it creates no audio context, network request or persisted setting
