import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '@/src/db/supabase';
import { feedSse } from './sse';
import type { ChatRequest, LLMProvider, StreamHandler } from './types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const DEFAULT_PROVIDER: 'anthropic' | 'gemini' =
  process.env.EXPO_PUBLIC_DEFAULT_CLOUD_PROVIDER === 'gemini' ? 'gemini' : 'anthropic';

/**
 * Streams from the `chat-cloud` Edge Function over SSE.
 *
 * Uses expo/fetch — RN's built-in fetch has no ReadableStream body, so
 * streaming silently breaks there. If a body stream is still unavailable,
 * falls back to parsing the complete SSE text after the fact (no live
 * tokens, but correct final result).
 *
 * Edge Function is responsible for picking provider (Anthropic / Gemini),
 * managing keys, and emitting normalized events:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"tool_call"/"tool_result",...}
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

    let res: Awaited<ReturnType<typeof expoFetch>>;
    try {
      res = await expoFetch(url, {
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
          provider: req.cloudProvider ?? DEFAULT_PROVIDER,
        }),
      });
    } catch (e) {
      onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      onEvent({ type: 'error', message: `cloud ${res.status}: ${text || 'no body'}` });
      return;
    }

    try {
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf = feedSse(buf, decoder.decode(value, { stream: true }), onEvent);
        }
      } else {
        // No streaming support: parse the complete SSE payload in one shot.
        const text = await res.text();
        feedSse('', text, onEvent);
      }
    } catch (e) {
      onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  },
};
