UPDATE rooms SET status = 'closed' WHERE status IN ('lobby', 'playing');
