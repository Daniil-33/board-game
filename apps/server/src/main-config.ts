export interface ServiceConfig {
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
}

/** Configuration from the environment; throws with the variable's name when it is missing or bad. */
export function readConfig(env: NodeJS.ProcessEnv): ServiceConfig {
  const databaseUrl = env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl === '') throw new Error('DATABASE_URL is required');
  const host = env['HOST'] || '127.0.0.1';
  const portText = env['PORT'] || '8787';
  const port = Number(portText);
  if (!/^[0-9]{1,5}$/.test(portText) || port > 65535) throw new Error(`PORT must be a port number, got "${portText}"`);
  return { databaseUrl, host, port };
}
