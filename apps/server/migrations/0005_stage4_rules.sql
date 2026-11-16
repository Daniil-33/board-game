-- Retire active rooms without converting historical game data.
UPDATE rooms SET status = 'closed' WHERE status IN ('lobby', 'playing');
