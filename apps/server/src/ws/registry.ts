/** Something the registry can tell to step down. */
export interface Replaceable {
  replaced(): void;
}

/**
 * At most one socket per (room, guest). Registering a second one replaces
 * the first; a socket that is no longer current never unregisters its
 * successor.
 */
export class ConnectionRegistry<C extends Replaceable> {
  private readonly current = new Map<string, C>();

  private static key(roomId: string, guestId: string): string {
    return `${roomId}\u0000${guestId}`;
  }

  register(roomId: string, guestId: string, connection: C): void {
    const key = ConnectionRegistry.key(roomId, guestId);
    const previous = this.current.get(key);
    this.current.set(key, connection);
    if (previous !== undefined && previous !== connection) previous.replaced();
  }

  unregister(roomId: string, guestId: string, connection: C): void {
    const key = ConnectionRegistry.key(roomId, guestId);
    if (this.current.get(key) === connection) this.current.delete(key);
  }

  get size(): number {
    return this.current.size;
  }
}
