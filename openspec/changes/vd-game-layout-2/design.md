# Design

## Context

See proposal.md for motivation and specs/client/game-screen/spec.md for observable behavior. The existing client already has a Vue desktop page layout, PixiJS board centre, event feed, responsive navigation, Reka UI primitives, and a sound engine. The change must use the current client projection and room model without adding protocol or server fields.

## Goals / Non-Goals

**Goals:** Recompose the desktop screen around the board centre, add a top bar and settings surface, fit the board at 1440×900, and keep captions, actions, and count strings tied to projected phase and locale.

**Non-Goals:** Change mobile navigation, game legality, game rules, projection schemas, or screenshot collection code.

## Decisions

- Put the top bar in the game page with the product name, localized player count, current connection/reconnect status, and settings control. Omit the room label entirely: never expose the join secret or internal room id. Omit the round counter because the projection has no round field; do not add projection fields.
- Keep turn header, dice and event feed in the centre composition. Keep existing Pixi rendering and board behavior; adjust available dimensions and page grid around the existing square board.
- Use the existing Reka popover primitive for settings, retaining sound control components and their test ids.
- Derive action visibility and captions from the existing `StateView` phase and its purchase, auction, rent/debt, turn, and result fields. Keep game legality in existing selectors.
- Sweep localized count messages in both locale files and use vue-i18n plural syntax. Cover Russian 1, 2, 5, 11, and 21 and English singular/plural in client tests.
- Preserve the mobile layout and verify it with the requested 390×844 board, purchase, and auction captures.

## Risks / Trade-offs

- [The full square board competes with centre content at 900 px height] → Use the desktop viewport height and available column width deliberately, and verify the required 1440×900 capture for clipping and page scroll.
- [Room and round labels in the reference are unavailable or unsafe] → Omit the room label and round counter, and document both deviations in the PR.
- [The Pixi caption is not Vue-reactive] → Add a small explicit display input/update path from the current projection and cover phase transitions with unit tests.
