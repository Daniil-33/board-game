/** The part of a WebSocket the connection uses; tests inject a fake. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(data: unknown): void;
  /** Called once when the socket is gone, whether it closed or failed. */
  onClose(): void;
}

export type SocketFactory = (url: string, handlers: SocketHandlers) => SocketLike;

/** A real browser WebSocket. */
export const browserSocketFactory: SocketFactory = (url, handlers) => {
  const ws = new WebSocket(url);
  ws.onopen = () => handlers.onOpen();
  ws.onmessage = (event) => handlers.onMessage(event.data);
  // A failed socket fires `error` and then `close`; `close` alone drives reconnect.
  ws.onclose = () => handlers.onClose();
  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
  };
};
