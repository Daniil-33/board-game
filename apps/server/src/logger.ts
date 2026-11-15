export type LogFields = Readonly<Record<string, unknown>>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

function line(level: string, message: string, fields: LogFields | undefined): string {
  return JSON.stringify({ level, message, ...fields });
}

/** One JSON object per line: info to stdout, warn and error to stderr. */
export const consoleLogger: Logger = {
  info: (message, fields) => console.log(line('info', message, fields)),
  warn: (message, fields) => console.warn(line('warn', message, fields)),
  error: (message, fields) => console.error(line('error', message, fields)),
};

/** Fields describing a caught value. */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return { error: error.message, errorName: error.name, ...(typeof code === 'string' ? { errorCode: code } : {}) };
  }
  return { error: String(error) };
}
