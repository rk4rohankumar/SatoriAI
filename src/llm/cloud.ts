import { supabase } from '@/src/db/supabase';
import type { ChatRequest, LLMProvider, StreamHandler } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Streams from the `chat-cloud` Edge Function over SSE.
 *
 * Edge Function is responsible for picking provider (Anthropic / Gemini),
 * managing keys, and emitting normalized events:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done","tokensIn":..,"tokensOut":..,"model":".."}
 */
export const cloudProvider: LLMProvider = {
  async chat(req: ChatRequest, onEvent: StreamHandler) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      onEvent({ type: 'error', message: 'Not signed in' });
      return;
    }

    const url = `${SUPABASE_URL}/functions/v1/chat-cloud`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: req.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON,
        },
        body: JSON.stringify({
          conversation_id: req.conversationId,
          messages: req.messages,
          rag_context: req.ragContext ?? null,
          provider: req.cloudProvider ?? 'anthropic',
        }),
        // @ts-expect-error - RN supports streaming via undici-like fetch in newer SDKs
        reactNative: { textStreaming: true },
      });
    } catch (e) {
      onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      onEvent({ type: 'error', message: `cloud ${res.status}: ${text || 'no body'}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const event = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const parsed = JSON.parse(payload) as Parameters<StreamHandler>[0];
              onEvent(parsed);
            } catch {
              // ignore malformed line
            }
          }
        }
      }
    } catch (e) {
      onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  },
};
