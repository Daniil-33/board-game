# engine/game-lifecycle Specification

## Purpose
Defines the current rules version and pure state upgrades for persisted games.

## ADDED Requirements

### Requirement: Core version upgrade chain
The current rules version SHALL be `core-9`. `upgradeState` SHALL preserve a genesis state with `rulesVersion: null`, recognize `core-9` unchanged, chain `core-7 → core-8 → core-9`, and upgrade `core-8` by adding `casino: null` while preserving jail entries. Unsupported versions SHALL fail explicitly.

#### Scenario: Core-8 prisoner upgrades
- **WHEN** a core-8 state with a prisoner is upgraded
- **THEN** the result SHALL be core-9 with the same `attemptsUsed` and `casino: null`

#### Scenario: Genesis remains unchanged
- **WHEN** genesis is passed to `upgradeState`
- **THEN** the returned state SHALL equal genesis with `rulesVersion: null`
