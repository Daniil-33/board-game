# client/localization Specification

## Purpose
Provide discoverable locale resources and verifiable translation coverage while retaining the existing English client presentation.

## Requirements

### Requirement: Discovered English locale
The client SHALL discover JSON resources in shared/i18n/locales without a hard-coded locale registry. Russian SHALL be the default and fallback, and English SHALL remain available. The locale selector SHALL remain hidden while only Russian and English exist and the owner has not requested a switch.

#### Scenario: Add a locale resource
- **WHEN** a valid JSON locale file is added to the locale directory
- **THEN** it is discovered without changing application registration code

#### Scenario: Default locale
- **WHEN** the client starts without a selected locale
- **THEN** Russian is displayed and missing translations fall back to Russian

### Requirement: Complete unchanged English keys
All client-owned UI text, accessibility labels and error-code reasons SHALL use locale keys with complete Russian translations and retained English values. Catalog names, player data and received server text SHALL remain data. CI SHALL reject raw UI text and missing keys; a unit check SHALL establish equality between used and defined Russian keys.

#### Scenario: Render existing interface
- **WHEN** an existing screen, rejection reason or debt notice is rendered in Russian
- **THEN** it uses Russian wording, following the design where shown, with correct interpolation and punctuation

#### Scenario: Broken resource coverage
- **WHEN** a used key is missing, a defined Russian key is unused or a raw UI string is introduced
- **THEN** the corresponding lint or key parity check fails

#### Scenario: Presentation text in TypeScript
- **WHEN** raw prose or an untranslated caption is introduced in a client presentation script or script-setup block
- **THEN** CI rejects it through the scoped parser-based presentation checks

#### Scenario: Rich sentence translation
- **WHEN** a locale reorders a sentence containing an emphasized amount
- **THEN** the complete named-slot message controls the sentence order and retains the amount emphasis

### Requirement: Shared locale formatting
Money and time formatting SHALL go through shared Intl wrappers using the active locale, preserving integer monetary values. Russian money SHALL use narrow no-break space (U+202F) grouping.

#### Scenario: Format existing values
- **WHEN** money, timer or timestamp fixtures are formatted
- **THEN** their displayed values follow the active locale without monetary rounding changes

### Requirement: Numeric count pluralization
Client messages that present numeric counts SHALL use correct plural forms for the active locale. Russian house counts SHALL render 1 as “дом”, 2–4 as “дома”, and 5 and 11 as “домов”; the form for 21 SHALL be “дом”. English count messages SHALL retain correct English singular and plural forms.

#### Scenario: Russian house counts
- **WHEN** a Russian house-count message is formatted with 1, 2, 5, 11, or 21
- **THEN** it renders “1 дом”, “2 дома”, “5 домов”, “11 домов”, or “21 дом”

#### Scenario: English house counts
- **WHEN** an English house-count message is formatted with 1 or more than 1
- **THEN** it uses the correct singular or plural form
