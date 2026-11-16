## ADDED Requirements

### Requirement: Auction timers follow state
During an auction the room SHALL arm only the pending auctionResponse deadline, with no paused turn timer. After resolution the room SHALL arm the resumed or next turn deadline from pendingDeadlines. Timers SHALL follow the same contract after recovery.

#### Scenario: Choice pauses and resumes
- **WHEN** StartAuction pauses a turn with remaining time and the auction resolves
- **THEN** only response timers SHALL be armed during the auction, and the resumed turn timer SHALL be due at resolution time plus the persisted remaining time

#### Scenario: Response expires
- **WHEN** the clock reaches the 10 second response deadline
- **THEN** a system Timeout for that response target SHALL persist the automatic pass and re-arm the next pending deadline

#### Scenario: Turn deadline starts auction
- **WHEN** a turn deadline expires with a pending purchase decision
- **THEN** the auction SHALL run on response deadlines and the turn SHALL close after resolution

#### Scenario: Overdue response at boot
- **WHEN** the server boots after a persisted response deadline
- **THEN** that response Timeout SHALL be persisted without further clock advance and subsequent timers SHALL follow the recovered state
