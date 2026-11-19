# Proposal

## Why

Production CSS minification converts the board's `rgb()` gradient tokens to hex, but the Pixi theme adapter only extracts `rgb()` and `rgba()` strings. As a result, production board group strips and special-cell gradients fall back to unrelated colors despite the accepted shared-token design.

## What Changes

- Parse the CSS color forms used by the shared group and board-gradient tokens after production minification.
- Add focused parser, built-CSS, and production-browser coverage, including desktop and mobile screenshots.
- Keep all token values, layout, and game behavior unchanged.

Out of scope: other visual differences, design token changes, board geometry, game rules, and server or protocol changes. No `GAME-BREAKDOWN.md` rule section applies because this is client rendering only; the visual contract is in `docs/efforts/visual-design/design.md` § “Tokens and theming” and § “Board rendering.”

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen`: clarify that minified production theme colors still render distinct group strips and special-cell gradients.

## Impact

- `apps/client/src/shared/config/pixi-theme.ts` and focused tests.
- Production CSS verification and board browser coverage/screenshots.
- No API, dependency, or token changes.
