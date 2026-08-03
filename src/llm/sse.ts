import type { StreamHandler } from './types';

/**
 * Feeds a raw SSE chunk into a buffer, extracting and dispatching complete
 * `data: ...\n\n` events as they become available. Pure function — no I/O.
 *
 * @returns the remaining (incomplete) buffer to be carried into the next call.
 */
export function feedSse(buffer: string, chunk: string, onEvent: StreamHandler): string {
  let buf = buffer + chunk;
  let idx: number;
  while ((idx = buf.indexOf('\n\n')) !== -1) {
    const event = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 2);
    for (const line of event.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        onEvent(JSON.parse(payload));
      } catch {
        // ignore malformed line
      }
    }
  }
  return buf;
}
