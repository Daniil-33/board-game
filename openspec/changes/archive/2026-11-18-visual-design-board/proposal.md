# Proposal

## Why

The current PixiJS ring uses the placeholder presentation. The owner’s desktop game screen and mobile board frames define a visual hierarchy that keeps assets and player activity recognizable as the board scales down.

## What Changes

- Render the 40 projected cells with design tokens, group-gradient price strips, logos or monograms, measured company labels and distinct special cells.
- Show ownership, houses, mortgages and stacked tokens from the current projection. Preserve tap-to-inspect and add desktop hover details.
- Restyle movement and rent transfer while respecting reduced motion and keeping view updates independent of animation.
- Make the commissioned geometric monograms available through the shared logo resolver whichever logo set is selected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/game-screen` — Responsive board appearance, asset inspection, projected markers and reduced-motion animation.
- `client/logos` — Shared fallback monogram resolution.

## Impact

The board widget, shared Pixi theme and logo resolver, and their tests are affected. The surrounding page layout, asset card contents, dice UI and sound are out of scope. Board topology and game semantics continue to follow `GAME-BREAKDOWN.md` sections «Участники и поле», «Движение, круг и награда», «Активы, рента и строительство», «Ипотека и расчёт долгов» and «Особые клетки и события». No server, protocol or game-rule changes are required.
