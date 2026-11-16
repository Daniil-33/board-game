# engine/board Specification

## Purpose

Defines the fixed board geometry and deterministic, versioned asset composition stored with each game, independently of client rendering.

## Requirements

### Requirement: Classic layout
The engine SHALL export the frozen CLASSIC_40 layout exactly as listed in the accepted stage-2-asset-catalog proposal. It SHALL have 40 indexed cells, corners at 0/10/20/30, 22 monopoly cells in ranks 1..8 of sizes 2,3,3,3,3,3,3,2, four logistics, two energy and eight chance cells. No placeholder ring or markers SHALL remain in game-core.

#### Scenario: Fixed geometry
- **WHEN** games with different seeds and two through six players are compared
- **THEN** their cell indices and kinds SHALL match the proposal cell by cell, with the same monopoly ranks

### Requirement: Versioned catalog
The ua-1 JSON catalog SHALL preserve the proposal's category and company names byte-for-byte and in proposal order: ten regular categories, six logistics and four energy companies. Category and company ids SHALL be stable ASCII slugs unique across the catalog. Each generated board SHALL store its catalog version and resolved names.

#### Scenario: Exact data
- **WHEN** the ua-1 catalog is loaded
- **THEN** its names, counts and ordering SHALL equal the accepted proposal, with unique ids and sufficient companies for every rank

### Requirement: Fixed price table
Prices SHALL use integer literals from the proposal's prices-1 table: ranks [720,800], [930,930,1030], [1210,1210,1330], [1560,1560,1720], [2020,2020,2220], [2610,2610,2870], [3370,3370,3710], [4360,4800]; logistics 1780, energy 1330. The highest-index cell of each monopoly SHALL receive its higher price. The board SHALL store priceTableVersion and resolved prices.

#### Scenario: Price total and stability
- **WHEN** any board is generated
- **THEN** its 28 asset prices SHALL sum to 56740 and each cell's price SHALL be independent of its assigned company

### Requirement: Deterministic generation
CreateGame SHALL store a resolved board with layout CLASSIC_40 and versions ua-1, prices-1 and gen-1. Generation SHALL use the seeded RNG after absorbing creation context entropy. gen-1 SHALL follow the Team Lead revision 1 shuffle and draw order; the consumed RNG SHALL be retained for subsequent commands. Rejected creation SHALL retain the original state and RNG.

#### Scenario: Exact shuffle contract
- **WHEN** gen-1 runs
- **THEN** it SHALL shuffle from i=n-1 down to 1, swapping with nextIntInclusive(0,i); shuffle all ten categories and take eight for rank order, shuffle each selected category in rank order and take its required companies in cell-index order, then shuffle logistics and energy in that order and take four and two in cell-index order

#### Scenario: Reproducible entropy-dependent composition
- **WHEN** identical seed, version and entropy are replayed
- **THEN** the complete board and RNG SHALL be identical; a fixed golden fixture SHALL pin both and a deterministic seed/entropy sample SHALL exhibit different compositions

### Requirement: Board shape invariant
Board SHALL be null exactly before creation. Otherwise its 40 cells SHALL match CLASSIC_40, with assets exactly on asset cells, correct prices, unique asset ids, one category per monopoly and eight distinct monopoly categories. Violations SHALL raise InvariantViolationError named board-shape.

#### Scenario: Invalid board
- **WHEN** a board has a duplicate asset, mismatched cell, wrong price or repeated monopoly category
- **THEN** invariant checking SHALL raise board-shape

### Requirement: Board generation event
Accepted creation SHALL emit GameCreated followed by public BoardGenerated carrying layout, catalogVersion, priceTableVersion and generatorVersion.

#### Scenario: Board event metadata
- **WHEN** CreateGame succeeds
- **THEN** BoardGenerated metadata SHALL match the board stored in state and SHALL contain no RNG state
