// deno-lint-ignore-file no-explicit-any
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

type Body = {
  conversation_id: string;
  messages: ChatMessage[];
  rag_context: string | null;
  provider?: 'anthropic' | 'gemini';
};

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const GOOGLE_KEY = Deno.env.get('GOOGLE_API_KEY');

const SOFT_DAILY_CAP = parseInt(Deno.env.get('SOFT_DAILY_CAP') ?? '100', 10);

function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let caller: Awaited<ReturnType<typeof authenticate>>;
  try {
    caller = await authenticate(req);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = (await req.json()) as Body;
  const provider = body.provider ?? 'anthropic';

  // ── soft daily cap ────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await caller.adminClient
    .from('usage_daily')
    .select('cloud_msgs')
    .eq('user_id', caller.userId)
    .eq('day', today)
    .maybeSingle();
  if (usage && usage.cloud_msgs >= SOFT_DAILY_CAP) {
    return new Response(
      JSON.stringify({ error: `daily cloud cap reached (${SOFT_DAILY_CAP})` }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      let tokensIn = 0;
      let tokensOut = 0;
      let model = '';

      try {
        if (provider === 'anthropic') {
          if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
          ({ tokensIn, tokensOut, model } = await streamAnthropic(body, controller));
        } else {
          if (!GOOGLE_KEY) throw new Error('GOOGLE_API_KEY not set');
          ({ tokensIn, tokensOut, model } = await streamGemini(body, controller));
        }

        controller.enqueue(sseEncode({ type: 'done', tokensIn, tokensOut, model }));

        // bookkeeping
        await caller.adminClient.rpc('increment_usage' as any, {}).catch(() => {});
        await caller.adminClient.from('usage_daily').upsert(
          {
            user_id: caller.userId,
            day: today,
            cloud_msgs: (usage?.cloud_msgs ?? 0) + 1,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
          },
          { onConflict: 'user_id,day' },
        );
      } catch (e) {
        controller.enqueue(
          sseEncode({ type: 'error', message: e instanceof Error ? e.message : String(e) }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

// ───────────────────────────── Anthropic (Claude) ───────────────────────────
async function streamAnthropic(
  body: Body,
  controller: ReadableStreamDefaultController,
): Promise<{ tokensIn: number; tokensOut: number; model: string }> {
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
  const isHard = (lastUser?.content?.length ?? 0) > 600 || !!body.rag_context;
  const model = isHard ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';

  const system =
    (body.messages.find((m) => m.role === 'system')?.content ?? '') +
    (body.rag_context
      ? `\n\nRelevant context (cite if used):\n${body.rag_context}`
      : '');

  const claudeMessages = body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages: claudeMessages,
      max_tokens: 1024,
      stream: true,
    }),
  });

  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${t}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let tokensIn = 0;
  let tokensOut = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n\n')) !== -1) {
      const ev = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      for (const line of ev.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            controller.enqueue(sseEncode({ type: 'token', text: parsed.delta.text }));
          } else if (parsed.type === 'message_start' && parsed.message?.usage) {
            tokensIn = parsed.message.usage.input_tokens ?? 0;
          } else if (parsed.type === 'message_delta' && parsed.usage) {
            tokensOut = parsed.usage.output_tokens ?? tokensOut;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { tokensIn, tokensOut, model };
}

// ───────────────────────────── Gemini ──────────────────────────────────────
async function streamGemini(
  body: Body,
  controller: ReadableStreamDefaultController,
): Promise<{ tokensIn: number; tokensOut: number; model: string }> {
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
  const isHard = (lastUser?.content?.length ?? 0) > 600 || !!body.rag_context;
  const model = isHard ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

  const systemText =
    (body.messages.find((m) => m.role === 'system')?.content ?? '') +
    (body.rag_context ? `\n\nRelevant context:\n${body.rag_context}` : '');

  const contents = body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GOOGLE_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`gemini ${res.status}: ${t}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let tokensIn = 0;
  let tokensOut = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n\n')) !== -1) {
      const ev = buf.slice(0, nl);
      buf = buf.slice(nl + 2);
      for (const line of ev.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const parsed = JSON.parse(payload);
          const text =
            parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) controller.enqueue(sseEncode({ type: 'token', text }));
          if (parsed?.usageMetadata) {
            tokensIn = parsed.usageMetadata.promptTokenCount ?? tokensIn;
            tokensOut = parsed.usageMetadata.candidatesTokenCount ?? tokensOut;
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  return { tokensIn, tokensOut, model };
}
