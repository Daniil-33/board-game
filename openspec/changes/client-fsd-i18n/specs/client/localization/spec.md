## Purpose

Provide discoverable locale resources and verifiable translation coverage while retaining the existing English client presentation.

## ADDED Requirements

### Requirement: Discovered English locale
The client SHALL discover JSON resources in shared/i18n/locales without a hard-coded locale registry. English SHALL remain the default and fallback for this foundation. An empty Russian skeleton SHALL NOT change rendered text.

#### Scenario: Add a locale resource
- **WHEN** a valid JSON locale file is added to the locale directory
- **THEN** it is discovered without changing application registration code

### Requirement: Complete unchanged English keys
All client-owned UI text, accessibility labels and error-code reasons SHALL use locale keys with unchanged English values. Catalog names, player data and received server text SHALL remain data. CI SHALL reject raw UI text and missing keys; a unit check SHALL establish equality between used and defined English keys.

#### Scenario: Render existing interface
- **WHEN** an existing screen, rejection reason or debt notice is rendered
- **THEN** its English wording, interpolation, punctuation and whitespace-visible output match the baseline

#### Scenario: Broken resource coverage
- **WHEN** a used key is missing, a defined English key is unused or a raw UI string is introduced
- **THEN** the corresponding lint or key parity check fails

#### Scenario: Presentation text in TypeScript
- **WHEN** raw prose or an untranslated caption is introduced in a client presentation script or script-setup block
- **THEN** CI rejects it through the scoped parser-based presentation checks

#### Scenario: Rich sentence translation
- **WHEN** a locale reorders a sentence containing an emphasized amount
- **THEN** the complete named-slot message controls the sentence order and retains the amount emphasis

### Requirement: Shared locale formatting
Money and time formatting SHALL go through shared Intl wrappers using the active locale. Existing visible number, currency and timer presentation SHALL remain unchanged in this task, including integer monetary values.

#### Scenario: Format existing values
- **WHEN** existing money, timer or timestamp fixtures are formatted in English
- **THEN** their displayed values match the existing client fixtures without monetary rounding changes
