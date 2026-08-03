import type { ChatRequest, LLMRoute } from './types';

/**
 * v1 router: simple rules. Replace with model-based classifier later.
 *
 * Rules:
 *   - explicit user choice wins
 *   - RAG context present  → cloud (1B too small for retrieval reasoning)
 *   - long input (>200ch)  → cloud
 *   - history > 6 turns    → cloud
 *   - else                 → local
 */
export function decideRoute(req: ChatRequest): LLMRoute {
  if (req.preferredRoute) return req.preferredRoute;

  if (req.ragContext && req.ragContext.length > 0) return 'cloud';

  const lastUserMsg = [...req.messages].reverse().find((m) => m.role === 'user');
  if (lastUserMsg && lastUserMsg.content.length > 200) return 'cloud';

  if (req.messages.length > 12) return 'cloud';

  return 'local';
}
