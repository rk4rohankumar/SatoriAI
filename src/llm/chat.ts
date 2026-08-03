import { supabase } from '@/src/db/supabase';
import { useMessages } from '@/src/store/messages';
import type { Message } from '@/src/store/messages';
import { cloudProvider } from './cloud';
import { isModelDownloaded, localProvider } from './local';
import { decideRoute } from './router';
import type { ChatMessage, ChatRequest, LLMRoute, StreamEvent, ToolEventRecord } from './types';

const SYSTEM_PROMPT =
  'You are SatoriAI, a concise assistant. Answer directly. Use markdown sparingly.';

export type SendOptions = {
  preferredRoute?: LLMRoute;
  cloudProvider?: 'anthropic' | 'gemini';
  ragContext?: string;
};

/**
 * Orchestrates a single user → assistant turn.
 *
 *  1. Persist user message (Postgres insert)
 *  2. Resolve route (local if model ready, else cloud if consented)
 *  3. Stream tokens into messages store (transient `streaming` state)
 *  4. On done, persist assistant message with route/model/tokens
 */
export async function sendMessage(
  conversationId: string,
  text: string,
  opts: SendOptions = {},
) {
  const ms = useMessages.getState();

  // 1. user message
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');

  const { data: userMsg, error: userErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      user_id: u.user.id,
      role: 'user',
      content: text,
    })
    .select()
    .single();
  if (userErr) throw userErr;
  if (userMsg) ms.appendLocal(userMsg as Message);

  // 2. build chat history for the LLM
  const history = (ms.byConv[conversationId] ?? []).map<ChatMessage>((m) => ({
    role: m.role,
    content: m.content,
  }));
  const llmMessages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
  ];

  // 3. read consent + model status to pick a route
  const [{ data: profile }, modelReady] = await Promise.all([
    supabase.from('profiles').select('cloud_consent').eq('id', u.user.id).single(),
    isModelDownloaded(),
  ]);
  const cloudConsent = !!profile?.cloud_consent;

  const req: ChatRequest = {
    messages: llmMessages,
    conversationId,
    preferredRoute: opts.preferredRoute,
    cloudProvider: opts.cloudProvider,
    ragContext: opts.ragContext,
  };

  let route: LLMRoute = decideRoute(req, { cloudConsent });
  if (route === 'local' && !modelReady) {
    route = cloudConsent ? 'cloud' : 'local'; // will surface user-friendly error if not consented
  }

  const provider = route === 'cloud' ? cloudProvider : localProvider;

  let acc = '';
  let model: string | undefined;
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  let lastError: string | null = null;
  const toolEvents: ToolEventRecord[] = [];

  const onEvent = (e: StreamEvent) => {
    if (e.type === 'token') {
      acc += e.text;
      ms.setStreaming(conversationId, acc);
    } else if (e.type === 'done') {
      model = e.model;
      tokensIn = e.tokensIn;
      tokensOut = e.tokensOut;
    } else if (e.type === 'error') {
      lastError = e.message;
    } else if (e.type === 'tool_call') {
      const rec: ToolEventRecord = { id: e.id, name: e.name, query: e.query, status: 'running' };
      toolEvents.push(rec);
      ms.setStreamingTool(conversationId, rec);
    } else if (e.type === 'tool_result') {
      const rec = toolEvents.find((t) => t.id === e.id);
      if (rec) {
        rec.status = e.error ? 'error' : 'done';
        rec.count = e.count;
        rec.domains = e.domains;
        rec.results = e.results;
        rec.error = e.error;
        ms.setStreamingTool(conversationId, { ...rec });
      }
    }
  };

  await provider.chat(req, onEvent);

  // If local failed and cloud is allowed, retry once on cloud
  if (lastError && route === 'local' && cloudConsent) {
    lastError = null;
    acc = '';
    toolEvents.length = 0;
    ms.setStreaming(conversationId, '');
    route = 'cloud';
    await cloudProvider.chat(req, onEvent);
  }

  // If cloud failed (offline, provider error) and the local model is ready,
  // retry once on-device so the app degrades instead of erroring.
  if (lastError && route === 'cloud' && modelReady) {
    lastError = null;
    acc = '';
    toolEvents.length = 0;
    ms.setStreamingTool(conversationId, null);
    ms.setStreaming(conversationId, '');
    route = 'local';
    await localProvider.chat(req, onEvent);
  }

  if (lastError && !acc) {
    acc = friendlyError(lastError, { route, modelReady, cloudConsent });
  }

  ms.clearStreaming(conversationId);

  // any tool call still "running" at this point never got a result (stream cut short)
  for (const rec of toolEvents) {
    if (rec.status === 'running') rec.status = 'interrupted';
  }

  // 4. persist assistant message
  const { data: asstMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      user_id: u.user.id,
      role: 'assistant',
      content: acc || '(no response)',
      route,
      model: model ?? null,
      tokens_in: tokensIn ?? null,
      tokens_out: tokensOut ?? null,
      tool_events: toolEvents.length ? toolEvents : null,
    })
    .select()
    .single();
  if (asstMsg) ms.appendLocal(asstMsg as Message);

  // bump conversation updated_at + autotitle if first turn
  const existing = ms.byConv[conversationId] ?? [];
  if (existing.filter((m) => m.role === 'user').length <= 1) {
    const title = text.slice(0, 50);
    await supabase.from('conversations').update({ title }).eq('id', conversationId);
  } else {
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
  }
}

function friendlyError(
  msg: string,
  ctx: { route: LLMRoute; modelReady: boolean; cloudConsent: boolean },
): string {
  if (!ctx.modelReady && !ctx.cloudConsent) {
    return "I can't answer yet. Open Settings → download the local model, or turn on cloud answers.";
  }
  if (!ctx.modelReady && ctx.cloudConsent) {
    return `Cloud failed: ${msg}`;
  }
  if (ctx.route === 'cloud') {
    return `Cloud error: ${msg}`;
  }
  return `Local error: ${msg}`;
}
