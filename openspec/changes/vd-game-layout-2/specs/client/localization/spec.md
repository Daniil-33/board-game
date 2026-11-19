## ADDED Requirements

### Requirement: Numeric count pluralization
Client messages that present numeric counts SHALL use correct plural forms for the active locale. Russian house counts SHALL render 1 as “дом”, 2–4 as “дома”, and 5 and 11 as “домов”; the form for 21 SHALL be “дом”. English count messages SHALL retain correct English singular and plural forms.

#### Scenario: Russian house counts
- **WHEN** a Russian house-count message is formatted with 1, 2, 5, 11, or 21
- **THEN** it renders “1 дом”, “2 дома”, “5 домов”, “11 домов”, or “21 дом”

#### Scenario: English house counts
- **WHEN** an English house-count message is formatted with 1 or more than 1
- **THEN** it uses the correct singular or plural form
