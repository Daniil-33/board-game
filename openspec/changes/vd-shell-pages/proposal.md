## Why

Apply the accepted visual design to guest entry, room discovery, waiting and the turn-order roll. The shared design system is available on the task base, so these screens can use the same responsive and accessible primitives as the rest of the client.

## What Changes

- Restyle guest login with Russian nickname guidance, validation and request errors.
- Show room availability and occupancy as N/6. Create a room with an optional access code in a responsive dialog. «Войти по коду» selects a listed locked room and submits its ID with the entered code. Include the disabled «Войти / профиль» placeholder with its reason.
- Show six waiting-room seats, creator and player markers, existing invite details, copy feedback, start availability and a confirmation before the creator closes the room by leaving.
- Present setup as a responsive turn-order dialog with avatars, dice, current roller, countdown and tie states, driven by the authoritative view.
- Verify the shell on desktop and phones, with Russian copy from localization keys, accessible dialogs and keyboard access to copying.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client/session` for the guest entry, lobby and waiting-room presentation and interactions.
- `client/game-screen` for the setup presentation.

## Impact

Client pages, the turn-header widget, related client features and entities, localization, focused tests and browser selectors or text expectations. Based on the stage 1 owner decisions in ROADMAP.md, GAME-BREAKDOWN.md headings «Порядок ходов, ход и кости» and «Принятые продуктовые элементы MVP», and the visual-design effort criteria C3, C4 and C11.

Out of scope are server and protocol changes, configurable capacity, code-only lookup, color selection, the game page layout, board, in-game dialogs, chat and sound.
