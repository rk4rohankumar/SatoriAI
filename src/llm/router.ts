import type { ChatRequest, LLMRoute } from './types';

export type RouteContext = {
  cloudConsent: boolean;
};

/**
 * v2 router: cloud-first.
 *
 * The local model is an offline/no-consent fallback, not the default —
 * quality gap between a 4B Q4 GGUF and Haiku/Flash is too large to route
 * everyday questions on-device.
 *
 * Rules:
 *   - explicit user choice wins
 *   - cloud consent given → cloud
 *   - else               → local
 *
 * chat.ts adds the runtime fallbacks: local when cloud fails (offline)
 * and cloud when the local model isn't downloaded.
 */
export function decideRoute(req: ChatRequest, ctx: RouteContext): LLMRoute {
  if (req.preferredRoute) return req.preferredRoute;
  if (ctx.cloudConsent) return 'cloud';
  return 'local';
}
