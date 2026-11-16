import { test, expect, createRoom, join, start, setup, active, action, resign } from './helpers';

test('public staging: two browsers complete setup and a turn over WSS', async ({ actors }, info) => {
  const players = await actors(2);
  for (const actor of players) {
    actor.page.on('websocket', socket => {
      expect(new URL(socket.url()).origin).toBe('wss://stage-api.focusima.space');
    });
  }
  const room = await createRoom(players[0]!);
  await join(players[1]!, room);
  await start(players);
  try {
    await setup(players);
    const actor = await active(players);
    const turnId = actor.view!.turn!.turnId;
    await action(actor, 'RollDice');
    await action(actor, 'EndTurn');
    // Landing on an asset can start an auction; real server timers settle it.
    for (const player of players) {
      await expect.poll(() => player.view?.turn?.turnId, { timeout: 60_000 }).not.toBe(turnId);
      const socketURL = await player.page.evaluate(() =>
        (window as unknown as { __e2eSocket: WebSocket }).__e2eSocket.url);
      expect(new URL(socketURL).origin).toBe('wss://stage-api.focusima.space');
      await player.page.screenshot({ path: info.outputPath(`staging-${players.indexOf(player)}.png`), fullPage: true });
    }
  } finally {
    // Finish the public test room, including when assertions fail.
    if (players[1]!.view?.phase !== 'finished') await resign(players[1]!);
  }
});
