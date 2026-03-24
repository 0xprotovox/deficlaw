/**
 * Debug logging utility.
 * Only logs when DEBUG=deficlaw is set. Silent otherwise (clean MCP output).
 */

const DEBUG_ENABLED = (process.env.DEBUG ?? '').split(',').some(
  s => s.trim() === 'deficlaw' || s.trim() === '*'
);

export function debug(message: string, ...args: unknown[]): void {
  if (!DEBUG_ENABLED) return;
  const ts = new Date().toISOString().slice(11, 23);
  process.stderr.write(`[deficlaw ${ts}] ${message}${args.length > 0 ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') : ''}\n`);
}

/** Time a function and log duration */
export async function debugTime<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!DEBUG_ENABLED) return fn();
  const start = Date.now();
  try {
    const result = await fn();
    debug(`${label} completed in ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    debug(`${label} failed in ${Date.now() - start}ms:`, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
