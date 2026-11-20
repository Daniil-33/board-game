# Spec Delta

## MODIFIED Requirements

### Requirement: Rules version gate
The engine SHALL accept CreateGame only for a rules version it explicitly supports. Any other version SHALL be rejected with UNSUPPORTED_RULES_VERSION. The engine MUST NOT run a game under a rules version it does not support. Only core-8 SHALL be supported; all earlier versions SHALL be rejected for new games.

#### Scenario: Unknown rules version
- **WHEN** CreateGame is issued with a rules version the engine does not list as supported
- **THEN** the engine SHALL reject it with UNSUPPORTED_RULES_VERSION

#### Scenario: Previous rules version
- **WHEN** CreateGame is issued with core-1, core-2, core-3, core-4, core-5, core-6 or core-7
- **THEN** the engine SHALL reject it with UNSUPPORTED_RULES_VERSION

## ADDED Requirements

### Requirement: Upgrade core-7 state
The pure state upgrade SHALL map a valid core-7 state to core-8 by setting charge to null, setting each mortgage lockedTurnId to null, and setting rulesVersion to core-8. A core-8 state SHALL be returned unchanged.

#### Scenario: Upgrade legacy state
- **WHEN** a core-7 state contains a prisoner and mortgages
- **THEN** the upgraded state SHALL preserve all existing data, preserve jail attempts and mortgage terms, add charge null and lockedTurnId null, and set rulesVersion to core-8

#### Scenario: Current state identity
- **WHEN** a core-8 state is upgraded
- **THEN** the result SHALL be identical to the input state
