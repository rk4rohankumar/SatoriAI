// deno-lint-ignore-file no-explicit-any
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { ToolRegistry } from '../_shared/tools/registry.ts';
import { createWebSearchTool } from '../_shared/tools/tavily.ts';
import { runAnthropic } from '../_shared/anthropic.ts';
import { runGemini } from '../_shared/gemini.ts';

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

type Body = {
  conversation_id: string;
  messages: ChatMessage[];
  rag_context: string | null;
  provider?: 'anthropic' | 'gemini';
};

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const GOOGLE_KEY = Deno.env.get('GOOGLE_API_KEY');
const TAVILY_KEY = Deno.env.get('TAVILY_API_KEY');

const SOFT_DAILY_CAP = parseInt(Deno.env.get('SOFT_DAILY_CAP') ?? '100', 10);

const registry = new ToolRegistry();
if (TAVILY_KEY) registry.register(createWebSearchTool(TAVILY_KEY));

function sseEncode(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

// ─────────────────────────────── helpers ───────────────────────────────────
function isHardRequest(body: Body): boolean {
  const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
  return (lastUser?.content?.length ?? 0) > 600 || !!body.rag_context;
}

function pickAnthropicModel(body: Body): string {
  return isHardRequest(body) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
}

function pickGeminiModel(body: Body): string {
  return isHardRequest(body) ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
}

function buildSystem(body: Body): string {
  let system =
    (body.messages.find((m) => m.role === 'system')?.content ?? '') +
    (body.rag_context ? `\n\nRelevant context (cite if used):\n${body.rag_context}` : '');
  if (registry.size > 0) {
    system += '\n\nIf a web search fails, answer from your own knowledge and say the search failed.';
  }
  return system;
}

function toAnthropicMessages(body: Body): { role: string; content: unknown }[] {
  return body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
}

function toGeminiContents(body: Body): { role: string; parts: unknown[] }[] {
  return body.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
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

      const emit = (event: Record<string, unknown>) => controller.enqueue(sseEncode(event));
      const deadlineMs = Date.now() + 100_000;

      try {
        if (provider === 'anthropic') {
          if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
          ({ tokensIn, tokensOut, model } = await runAnthropic({
            apiKey: ANTHROPIC_KEY,
            model: pickAnthropicModel(body),
            system: buildSystem(body),
            messages: toAnthropicMessages(body),
            registry,
            emit,
            deadlineMs,
          }));
        } else {
          if (!GOOGLE_KEY) throw new Error('GOOGLE_API_KEY not set');
          ({ tokensIn, tokensOut, model } = await runGemini({
            apiKey: GOOGLE_KEY,
            model: pickGeminiModel(body),
            system: buildSystem(body),
            messages: toGeminiContents(body),
            registry,
            emit,
            deadlineMs,
          }));
        }

        controller.enqueue(sseEncode({ type: 'done', tokensIn, tokensOut, model }));

        // bookkeeping
        try {
          await caller.adminClient.rpc('increment_usage' as any, {});
        } catch {
          /* best-effort */
        }
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
