# Design

## Context

`boardTheme()` reads CSS custom properties once and currently extracts gradient colors with an `rgb()`/`rgba()` regular expression. The production CSS pipeline emits hexadecimal colors, so the adapter returns no gradient colors and `BoardCanvas` uses its fallback inset/cell colors. The fix is confined to shared client configuration and verification.

## Approach

- Add a small pure CSS-color parser that recognizes 3/4/6/8 digit hex, comma and space forms of `rgb()`/`rgba()`, and CSS named colors. Convert each accepted color to the representation already consumed by the board renderer without changing token values.
- Use the parser for group and board-gradient token values; preserve the existing two-color fallback when a token cannot produce the expected colors.
- Unit-test each supported syntax and the exact minified production token values.
- Build the client and inspect emitted CSS so each `--group-*` and `--gradient-board-*` token resolves to at least two parsed colors.
- Add a production-stack browser assertion sampling a group strip and special-cell corner against the existing fallback values, then capture desktop and mobile production screenshots in the established evidence directory.

## Boundaries

No token, layout, game behavior, board geometry, or renderer contract changes. The parser remains pure and in `apps/client`; no dependency is added.

## Risks

Pixi graphics may encode the same visible color in a renderer-specific numeric format. Tests should validate parsed values and the browser check should sample the final rendered pixels, so both adapter and rendering behavior are covered.
