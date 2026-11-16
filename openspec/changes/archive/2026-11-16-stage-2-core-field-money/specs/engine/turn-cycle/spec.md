## RENAMED Requirements

- FROM: `### Requirement: Movement on the placeholder ring`
- TO: `### Requirement: Movement on CLASSIC_40`

## MODIFIED Requirements

### Requirement: Movement on CLASSIC_40
After a roll that does not send the player to jail, the player SHALL move forward by the dice sum modulo 40 and `PlayerMoved` SHALL report the start cell, end cell and steps. The ring SHALL be the exported CLASSIC_40 layout. A forward crossing or exact landing on cell 0 SHALL credit economy.lapReward once immediately after PlayerMoved and before any landing settlement; landing effects SHALL otherwise be inert in stage 2.

#### Scenario: Wrap around the ring
- **WHEN** a player on cell 36 rolls 3 and 4
- **THEN** the player SHALL be on cell 3 and `PlayerMoved` SHALL report from 36, to 3, steps 7, followed by one lap-reward BalanceChanged event
