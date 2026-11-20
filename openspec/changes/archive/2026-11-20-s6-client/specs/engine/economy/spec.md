## MODIFIED Requirements

### Requirement: Forward crossing reward
Normal forward movement crossing or landing on cell zero SHALL credit the fixed lap reward once, immediately after PlayerMoved and before landing settlement. Third-double transfer to jail SHALL pay nothing. Jail release SHALL use normal movement; landing on a free asset SHALL then offer purchase and owned assets SHALL have no landing effect.

#### Scenario: Crossing and exact landing
- **WHEN** a player moves forward from 39 by 2, from 35 by 5, or from 30 by 12
- **THEN** one lap-reward event SHALL follow PlayerMoved and the resulting balance SHALL increase by economy.lapReward

#### Scenario: Third double and interim release
- **WHEN** a third consecutive double sends a player to jail, or a player moves from jail at 10 by at most 12
- **THEN** no lap-reward event SHALL be emitted
