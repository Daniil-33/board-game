# Spec Delta

## ADDED Requirements

### Requirement: Mobile stage 6 surfaces preserve the board
Below 1024 pixels, each stage 6 reveal and decision or charge dialog SHALL remain within the viewport without horizontal page scroll, and the board SHALL remain fully rendered behind the surfaces. At 1440x900 and 1920x1080, the existing centered presentation SHALL be preserved.

#### Scenario: Chance gain and casino decision on mobile
- **WHEN** a chance-gain reveal or casino decision is visible at 390x844 after direct open, desktop-to-mobile resize, or landscape-to-portrait rotation
- **THEN** the surface SHALL be within the viewport without horizontal page scroll and the board SHALL remain fully rendered

#### Scenario: Chance loss with bank charge on mobile
- **WHEN** a chance-loss reveal and bank-charge dialog are visible at 390x844 after direct open, desktop-to-mobile resize, or landscape-to-portrait rotation
- **THEN** both surfaces SHALL be within the viewport without horizontal page scroll and the board SHALL remain fully rendered

#### Scenario: Casino result on mobile
- **WHEN** a casino result reveal is visible at 390x844 after direct open, desktop-to-mobile resize, or landscape-to-portrait rotation
- **THEN** the reveal SHALL be within the viewport without horizontal page scroll and the board SHALL remain fully rendered

#### Scenario: Desktop reveal and dialog presentation
- **WHEN** any stage 6 reveal or dialog is visible at 1440x900 or 1920x1080
- **THEN** it SHALL retain the existing desktop centering and appearance
