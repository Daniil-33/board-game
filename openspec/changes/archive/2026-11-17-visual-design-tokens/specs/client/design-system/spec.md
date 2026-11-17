## Purpose

Provide a consistent, accessible visual foundation for the client and later screen designs.

## ADDED Requirements

### Requirement: Shared design tokens
The client SHALL expose the desktop design token frame's colors, gradients, player colors, radii, shadows, spacing and fonts as shared theme values, including an adapter for Pixi. Client presentation code outside shared configuration SHALL be checked for raw hex and RGB colors.

The existing Pixi board renderer MAY use the legacy palette centralized in shared configuration until TASK-vd-board switches it to the computed theme.

#### Scenario: Shared theme values
- **WHEN** a DOM or Pixi consumer requests a design value
- **THEN** it uses the shared theme derived from the design, except for the interim board renderer

### Requirement: Accessible shared primitives
The client SHALL provide Button, Badge, Money, Countdown, ResponsiveDialog, AlertDialog, Tooltip, Popover, Tabs and Toast primitives. Dialogs SHALL trap focus and close on Escape; responsive dialogs SHALL use a bottom sheet below 1024 pixels. Disabled buttons SHALL expose their reason, including visible text on mobile.

#### Scenario: Dialog keyboard interaction
- **WHEN** a dialog is open and a user navigates by keyboard or presses Escape
- **THEN** focus remains contained until the dialog closes, and Escape closes it

#### Scenario: Disabled action
- **WHEN** an action is disabled
- **THEN** its reason is available to the user on desktop and visibly on mobile

### Requirement: Contrast and evidence
Text token and surface combinations SHALL meet WCAG AA contrast of at least 4.5:1. A design-system page SHALL be available only in development builds for visual evidence.

#### Scenario: Contrast verification
- **WHEN** the token contrast test runs
- **THEN** every designated text and surface pair reaches 4.5:1

#### Scenario: Production build
- **WHEN** the production client is loaded with the design-system query
- **THEN** the development page is unavailable
