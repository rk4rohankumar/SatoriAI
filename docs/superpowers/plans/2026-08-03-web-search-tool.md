# Web Search Tool (v2.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloud chats gain agentic web search (Tavily) with live tool-activity UI and persisted tool history.

**Architecture:** Server-side agentic loop inside the `chat-cloud` Supabase Edge Function — model emits `tool_use`, function executes Tavily via a small tool registry (mirrors learn-ai's `tools/` package), feeds `tool_result` back, repeats (max 3 rounds). New SSE event types `tool_call`/`tool_result` stream to the client, which renders ToolChips and persists `tool_events` jsonb with the assistant message. Local Gemma path untouched.

**Tech Stack:** Deno (Edge Functions), Tavily REST API, Anthropic Messages API tool-calling, Gemini functionDeclarations, Expo RN + zustand, jest-expo for client unit tests.

Spec: `docs/superpowers/specs/2026-08-03-web-search-tool-design.md`

## Global Constraints

- Max 3 tool rounds per message; 10s timeout per Tavily call; ~100s wall-clock guard for the whole loop.
- Missing `TAVILY_API_KEY` → tool omitted entirely; chat must still work.
- SSE event shapes: `{type:'tool_call', id, name, query}` and `{type:'tool_result', id, count, domains, results:[{title,url}], error?}`.
- Tool errors never kill the stream; the model answers from its own knowledge.
- Unknown SSE event types must be ignored by the client.
- Tools are cloud-only; `src/llm/local.ts` and `src/llm/router.ts` are not modified.
- Edge Function tool layer lives in `supabase/functions/_shared/tools/` as a registry (base/registry/tavily), mirroring learn-ai's `server/tools/` package.

---

### Task 1: `tool_events` column + regenerated DB types

**Files:**
- Create: `supabase/migrations/20260803120000_add_tool_events.sql`
- Modify: `src/db/types.ts` (regenerated)

**Interfaces:**
- Produces: `messages.tool_events` nullable jsonb column; `Database['public']['Tables']['messages']['Row']` gains `tool_events: Json | null`.

- [ ] **Step 1: Write migration**

```sql
alter table public.messages add column tool_events jsonb;
```

- [ ] **Step 2: Apply to remote**

Run: `supabase db push`
Expected: migration `20260803120000_add_tool_events.sql` applied, no errors.

- [ ] **Step 3: Regenerate types**

Run: `supabase gen types typescript --linked > src/db/types.ts`
Expected: `tool_events: Json | null` present in messages Row/Insert/Update.

- [ ] **Step 4: Typecheck**

Run: `node_modules/.bin/tsc --noEmit`
Expected: clean. (If generated types break existing code, fix call sites in the same commit — expected diff is zero since the column is new and nullable.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803120000_add_tool_events.sql src/db/types.ts
git commit -m "feat: add messages.tool_events jsonb column"
```

---

### Task 2: Tool registry + Tavily tool (Edge Function shared layer)

**Files:**
- Create: `supabase/functions/_shared/tools/base.ts`
- Create: `supabase/functions/_shared/tools/registry.ts`
- Create: `supabase/functions/_shared/tools/tavily.ts`
- Test: `supabase/functions/_shared/tools/registry_test.ts`
- Test: `supabase/functions/_shared/tools/tavily_test.ts`

**Interfaces:**
- Produces:
  - `type ToolDefinition = { name: string; description: string; input_schema: Record<string, unknown> }`
  - `type ToolResult = { success: boolean; content: string; metadata?: Record<string, unknown> }`
  - `interface Tool { definition: ToolDefinition; execute(args: Record<string, unknown>): Promise<ToolResult> }`
  - `class ToolRegistry { register(tool: Tool): void; listDefinitions(): ToolDefinition[]; execute(name, args, timeoutMs?): Promise<ToolResult>; get size(): number }`
  - `function createWebSearchTool(apiKey: string, fetchFn?: typeof fetch): Tool` — tool name `web_search`, metadata carries `results: {title, url, content}[]`.

- [ ] **Step 1: Write failing registry tests**

`supabase/functions/_shared/tools/registry_test.ts`:

```ts
import { assertEquals } from 'jsr:@std/assert';
import { ToolRegistry } from './registry.ts';
import type { Tool } from './base.ts';

const okTool: Tool = {
  definition: { name: 'echo', description: 'echoes', input_schema: { type: 'object' } },
  execute: (args) => Promise.resolve({ success: true, content: String(args.q) }),
};

Deno.test('executes registered tool', async () => {
  const r = new ToolRegistry();
  r.register(okTool);
  const res = await r.execute('echo', { q: 'hi' });
  assertEquals(res, { success: true, content: 'hi' });
});

Deno.test('unknown tool returns failure, does not throw', async () => {
  const r = new ToolRegistry();
  const res = await r.execute('nope', {});
  assertEquals(res.success, false);
});

Deno.test('throwing tool becomes failure result', async () => {
  const r = new ToolRegistry();
  r.register({
    definition: { name: 'boom', description: '', input_schema: {} },
    execute: () => Promise.reject(new Error('network down')),
  });
  const res = await r.execute('boom', {});
  assertEquals(res.success, false);
});

Deno.test('slow tool times out', async () => {
  const r = new ToolRegistry();
  r.register({
    definition: { name: 'slow', description: '', input_schema: {} },
    execute: () => new Promise((resolve) => setTimeout(() => resolve({ success: true, content: 'late' }), 200)),
  });
  const res = await r.execute('slow', {}, 50);
  assertEquals(res.success, false);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `deno test supabase/functions/_shared/tools/registry_test.ts`
Expected: FAIL — module `./registry.ts` not found.

- [ ] **Step 3: Implement base.ts + registry.ts**

`base.ts`:

```ts
export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ToolResult = {
  success: boolean;
  content: string;
  metadata?: Record<string, unknown>;
};

export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
```

`registry.ts`:

```ts
import type { Tool, ToolDefinition, ToolResult } from './base.ts';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.definition.name, tool);
  }

  get size(): number {
    return this.tools.size;
  }

  listDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { success: false, content: `unknown tool: ${name}` };
    let timer: number | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('tool timeout')), timeoutMs);
      });
      return await Promise.race([tool.execute(args), timeout]);
    } catch (e) {
      return {
        success: false,
        content: `tool error: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Run registry tests, verify pass**

Run: `deno test supabase/functions/_shared/tools/registry_test.ts`
Expected: 4 passed.

- [ ] **Step 5: Write failing Tavily tests**

`tavily_test.ts`:

```ts
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert';
import { createWebSearchTool } from './tavily.ts';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    );
}

Deno.test('formats results and carries metadata', async () => {
  const tool = createWebSearchTool('key', fakeFetch(200, {
    results: [{ title: 'T1', url: 'https://a.com/x', content: 'C1' }],
  }));
  const res = await tool.execute({ query: 'hello' });
  assertEquals(res.success, true);
  assertStringIncludes(res.content, 'T1');
  assertEquals((res.metadata?.results as unknown[]).length, 1);
});

Deno.test('http error returns failure', async () => {
  const tool = createWebSearchTool('key', fakeFetch(500, {}));
  const res = await tool.execute({ query: 'hello' });
  assertEquals(res.success, false);
});

Deno.test('empty query returns failure without fetching', async () => {
  const tool = createWebSearchTool('key', () => Promise.reject(new Error('should not fetch')));
  const res = await tool.execute({});
  assertEquals(res.success, false);
});
```

- [ ] **Step 6: Run Tavily tests, verify fail**

Run: `deno test supabase/functions/_shared/tools/tavily_test.ts`
Expected: FAIL — `./tavily.ts` not found.

- [ ] **Step 7: Implement tavily.ts**

```ts
import type { Tool, ToolResult } from './base.ts';

export type TavilyResult = { title: string; url: string; content: string };

export function createWebSearchTool(apiKey: string, fetchFn: typeof fetch = fetch): Tool {
  return {
    definition: {
      name: 'web_search',
      description:
        'Search the web for current information. Use for recent events, live data, or anything after your knowledge cutoff.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string', description: 'The search query' } },
        required: ['query'],
      },
    },
    async execute(args): Promise<ToolResult> {
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (!query) return { success: false, content: 'empty query' };

      const res = await fetchFn('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
      });
      if (!res.ok) return { success: false, content: `tavily ${res.status}` };

      const data = await res.json();
      // deno-lint-ignore no-explicit-any
      const results: TavilyResult[] = (data.results ?? []).map((r: any) => ({
        title: String(r.title ?? ''),
        url: String(r.url ?? ''),
        content: String(r.content ?? ''),
      }));
      const content = results
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`)
        .join('\n\n') || 'no results';
      return { success: true, content, metadata: { results } };
    },
  };
}
```

- [ ] **Step 8: Run all tool tests, verify pass**

Run: `deno test supabase/functions/_shared/tools/`
Expected: 7 passed.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/tools/
git commit -m "feat: tool registry + tavily web_search tool for edge functions"
```

---

### Task 3: Anthropic agentic tool loop

**Files:**
- Create: `supabase/functions/_shared/anthropic.ts` (loop extracted from `chat-cloud/index.ts`)
- Test: `supabase/functions/_shared/anthropic_test.ts`

**Interfaces:**
- Consumes: `ToolRegistry` from Task 2.
- Produces:

```ts
export type EmitFn = (event: Record<string, unknown>) => void;
export type ProviderResult = { tokensIn: number; tokensOut: number; model: string };
export function runAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string | undefined;
  messages: { role: string; content: unknown }[];
  registry: ToolRegistry;
  emit: EmitFn;           // receives {type:'token'|'tool_call'|'tool_result', ...}
  fetchFn?: typeof fetch;
  deadlineMs?: number;    // absolute Date.now() cutoff, default now+100_000
  maxRounds?: number;     // default 3
}): Promise<ProviderResult>;
```

- Emits exactly: `{type:'token', text}`, `{type:'tool_call', id, name, query}`, `{type:'tool_result', id, count, domains, results, error?}`.

- [ ] **Step 1: Write failing tests with mocked provider stream**

`anthropic_test.ts` — helper builds an SSE `Response` from event strings; `fetchFn` returns scripted responses per call:

```ts
import { assertEquals } from 'jsr:@std/assert';
import { runAnthropic } from './anthropic.ts';
import { ToolRegistry } from './tools/registry.ts';

function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new Blob([body]).stream(), { status: 200 });
}

function scriptedFetch(responses: Response[]): typeof fetch {
  let i = 0;
  return () => Promise.resolve(responses[i++]);
}

const TEXT_ONLY = [
  { type: 'message_start', message: { usage: { input_tokens: 10 } } },
  { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hi' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
];

const TOOL_ROUND = [
  { type: 'message_start', message: { usage: { input_tokens: 10 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu_1', name: 'web_search' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"weather"}' } },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
];

Deno.test('text-only passthrough emits tokens', async () => {
  const events: Record<string, unknown>[] = [];
  const res = await runAnthropic({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', content: 'hi' }],
    registry: new ToolRegistry(),
    emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponse(TEXT_ONLY)]),
  });
  assertEquals(events.filter((e) => e.type === 'token').length, 1);
  assertEquals(res.tokensIn, 10);
});

Deno.test('tool round: executes tool, emits tool_call + tool_result, continues', async () => {
  const registry = new ToolRegistry();
  registry.register({
    definition: { name: 'web_search', description: '', input_schema: {} },
    execute: () => Promise.resolve({
      success: true, content: '[1] T\nhttps://a.com\nC',
      metadata: { results: [{ title: 'T', url: 'https://a.com', content: 'C' }] },
    }),
  });
  const events: Record<string, unknown>[] = [];
  await runAnthropic({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', content: 'weather?' }],
    registry, emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponse(TOOL_ROUND), sseResponse(TEXT_ONLY)]),
  });
  assertEquals(events.filter((e) => e.type === 'tool_call').length, 1);
  assertEquals(events.filter((e) => e.type === 'tool_result').length, 1);
  assertEquals(events.filter((e) => e.type === 'token').length, 1);
});

Deno.test('failed tool emits tool_result with error and still finishes', async () => {
  const registry = new ToolRegistry();
  registry.register({
    definition: { name: 'web_search', description: '', input_schema: {} },
    execute: () => Promise.resolve({ success: false, content: 'tavily 500' }),
  });
  const events: Record<string, unknown>[] = [];
  await runAnthropic({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', content: 'weather?' }],
    registry, emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponse(TOOL_ROUND), sseResponse(TEXT_ONLY)]),
  });
  const tr = events.find((e) => e.type === 'tool_result') as Record<string, unknown>;
  assertEquals(typeof tr.error, 'string');
});

Deno.test('round cap: stops requesting tools after maxRounds', async () => {
  const registry = new ToolRegistry();
  registry.register({
    definition: { name: 'web_search', description: '', input_schema: {} },
    execute: () => Promise.resolve({ success: true, content: 'x', metadata: { results: [] } }),
  });
  const events: Record<string, unknown>[] = [];
  // 3 tool rounds scripted, then final text; with maxRounds 2 the 3rd fetch must
  // be the forced-final round (tool_choice none → we script TEXT_ONLY there).
  await runAnthropic({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', content: 'weather?' }],
    registry, emit: (e) => events.push(e), maxRounds: 2,
    fetchFn: scriptedFetch([sseResponse(TOOL_ROUND), sseResponse(TOOL_ROUND), sseResponse(TEXT_ONLY)]),
  });
  assertEquals(events.filter((e) => e.type === 'tool_call').length, 2);
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `deno test supabase/functions/_shared/anthropic_test.ts`
Expected: FAIL — `./anthropic.ts` not found.

- [ ] **Step 3: Implement `anthropic.ts`**

Move the existing `streamAnthropic` body out of `chat-cloud/index.ts` and extend it. Full implementation:

```ts
import type { ToolRegistry } from './tools/registry.ts';

export type EmitFn = (event: Record<string, unknown>) => void;
export type ProviderResult = { tokensIn: number; tokensOut: number; model: string };

type ToolUse = { id: string; name: string; inputJson: string };

export async function runAnthropic(opts: {
  apiKey: string;
  model: string;
  system: string | undefined;
  messages: { role: string; content: unknown }[];
  registry: ToolRegistry;
  emit: EmitFn;
  fetchFn?: typeof fetch;
  deadlineMs?: number;
  maxRounds?: number;
}): Promise<ProviderResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const deadline = opts.deadlineMs ?? Date.now() + 100_000;
  const maxRounds = opts.maxRounds ?? 3;
  const tools = opts.registry.size > 0
    ? opts.registry.listDefinitions().map((d) => ({
        name: d.name, description: d.description, input_schema: d.input_schema,
      }))
    : undefined;

  const messages = [...opts.messages];
  let tokensIn = 0;
  let tokensOut = 0;
  let round = 0;

  while (true) {
    const toolsAllowed = !!tools && round < maxRounds && Date.now() < deadline;
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        system: opts.system || undefined,
        messages,
        max_tokens: 1024,
        stream: true,
        ...(toolsAllowed ? { tools } : {}),
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(`anthropic ${res.status}: ${t}`);
    }

    // parse one streamed response
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let roundText = '';
    let stopReason = '';
    const toolUses: ToolUse[] = [];
    let currentTool: ToolUse | null = null;

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
            const p = JSON.parse(payload);
            if (p.type === 'message_start' && p.message?.usage) {
              tokensIn += p.message.usage.input_tokens ?? 0;
            } else if (p.type === 'content_block_start' && p.content_block?.type === 'tool_use') {
              currentTool = { id: p.content_block.id, name: p.content_block.name, inputJson: '' };
            } else if (p.type === 'content_block_delta') {
              if (p.delta?.type === 'text_delta' && p.delta.text) {
                roundText += p.delta.text;
                opts.emit({ type: 'token', text: p.delta.text });
              } else if (p.delta?.type === 'input_json_delta' && currentTool) {
                currentTool.inputJson += p.delta.partial_json ?? '';
              }
            } else if (p.type === 'content_block_stop' && currentTool) {
              toolUses.push(currentTool);
              currentTool = null;
            } else if (p.type === 'message_delta') {
              stopReason = p.delta?.stop_reason ?? stopReason;
              if (p.usage) tokensOut += p.usage.output_tokens ?? 0;
            }
          } catch { /* ignore malformed line */ }
        }
      }
    }
    // flush tool_use if stream ended without content_block_stop (mocked streams)
    if (currentTool) toolUses.push(currentTool);

    if (stopReason !== 'tool_use' || toolUses.length === 0) {
      return { tokensIn, tokensOut, model: opts.model };
    }

    // execute tools, append assistant turn + tool results, next round
    round += 1;
    const assistantContent: unknown[] = [];
    if (roundText) assistantContent.push({ type: 'text', text: roundText });
    const resultBlocks: unknown[] = [];

    for (const tu of toolUses) {
      let input: Record<string, unknown> = {};
      try { input = JSON.parse(tu.inputJson || '{}'); } catch { /* keep {} */ }
      assistantContent.push({ type: 'tool_use', id: tu.id, name: tu.name, input });
      opts.emit({ type: 'tool_call', id: tu.id, name: tu.name, query: String(input.query ?? '') });

      const result = await opts.registry.execute(tu.name, input);
      // deno-lint-ignore no-explicit-any
      const results = ((result.metadata?.results as any[]) ?? []).map((r) => ({
        title: r.title, url: r.url,
      }));
      const domains = results.map((r) => {
        try { return new URL(r.url).hostname; } catch { return ''; }
      }).filter(Boolean);
      opts.emit({
        type: 'tool_result', id: tu.id, count: results.length, domains, results,
        ...(result.success ? {} : { error: result.content }),
      });
      resultBlocks.push({
        type: 'tool_result', tool_use_id: tu.id,
        content: result.success ? result.content : `Search failed: ${result.content}. Answer from your own knowledge and mention the search failed.`,
      });
    }

    messages.push({ role: 'assistant', content: assistantContent });
    messages.push({ role: 'user', content: resultBlocks });
  }
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `deno test supabase/functions/_shared/anthropic_test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/anthropic.ts supabase/functions/_shared/anthropic_test.ts
git commit -m "feat: anthropic agentic tool loop with SSE tool events"
```

---

### Task 4: Gemini agentic tool loop

**Files:**
- Create: `supabase/functions/_shared/gemini.ts`
- Test: `supabase/functions/_shared/gemini_test.ts`

**Interfaces:**
- Consumes: `ToolRegistry` (Task 2), `EmitFn`/`ProviderResult` types (Task 3 — import from `./anthropic.ts`).
- Produces: `runGemini(opts)` — same options object shape as `runAnthropic` (apiKey, model, system, messages as `{role, parts}` Gemini contents, registry, emit, fetchFn, deadlineMs, maxRounds), same emitted event shapes, returns `ProviderResult`.

- [ ] **Step 1: Write failing tests**

Same scripted-fetch pattern as Task 3. Gemini SSE payload shapes:

```ts
const G_TEXT = [
  { candidates: [{ content: { parts: [{ text: 'hi' }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 } },
];
const G_TOOL = [
  { candidates: [{ content: { parts: [{ functionCall: { name: 'web_search', args: { query: 'weather' } } }] } }] },
];
```

Tests mirror Task 3: text passthrough; tool round emits `tool_call`/`tool_result` and continues with a second scripted response; failed tool carries `error`; `maxRounds` cap respected. Tool-call ids are synthesized as `g_${round}_${index}` (Gemini has no tool ids).

- [ ] **Step 2: Run tests, verify fail**

Run: `deno test supabase/functions/_shared/gemini_test.ts`
Expected: FAIL — `./gemini.ts` not found.

- [ ] **Step 3: Implement `gemini.ts`**

Move existing `streamGemini` body from `chat-cloud/index.ts`, extend. Key mechanics (structure identical to `runAnthropic`, so only deltas shown — the file itself is complete code):

- Request body gains, when tools allowed:
  `tools: [{ functionDeclarations: registry.listDefinitions().map(d => ({ name: d.name, description: d.description, parameters: d.input_schema })) }]`
- Parse each SSE chunk's `candidates[0].content.parts`: `part.text` → emit token; `part.functionCall {name, args}` → collect.
- After stream ends with collected functionCalls: for each, emit `tool_call` (id `g_${round}_${i}`), `registry.execute(name, args)`, emit `tool_result` (same shape/derivation as Task 3, including the error case), then append to `contents`:
  `{ role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) }` and
  `{ role: 'user', parts: results.map((r, i) => ({ functionResponse: { name: calls[i].name, response: { content: r.success ? r.content : `Search failed: ${r.content}` } } })) }`
- No functionCalls → return `{ tokensIn, tokensOut, model }`.
- Same `maxRounds`/`deadline` gating as `runAnthropic` (tools omitted from request when exceeded).

- [ ] **Step 4: Run tests, verify pass**

Run: `deno test supabase/functions/_shared/gemini_test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/gemini.ts supabase/functions/_shared/gemini_test.ts
git commit -m "feat: gemini agentic tool loop"
```

---

### Task 5: Wire `chat-cloud/index.ts` to the loops + docs

**Files:**
- Modify: `supabase/functions/chat-cloud/index.ts` (replace inline `streamAnthropic`/`streamGemini`)
- Modify: `SETUP.md` (TAVILY_API_KEY secret), `README.md` (feature bullet)

**Interfaces:**
- Consumes: `runAnthropic`, `runGemini`, `ToolRegistry`, `createWebSearchTool`.
- Produces: deployed function emitting `token` / `tool_call` / `tool_result` / `done` / `error` SSE events. No client-visible contract changes besides the two new event types.

- [ ] **Step 1: Rewire index.ts**

Inside `Deno.serve`, before building the stream:

```ts
import { ToolRegistry } from '../_shared/tools/registry.ts';
import { createWebSearchTool } from '../_shared/tools/tavily.ts';
import { runAnthropic } from '../_shared/anthropic.ts';
import { runGemini } from '../_shared/gemini.ts';

const TAVILY_KEY = Deno.env.get('TAVILY_API_KEY');

const registry = new ToolRegistry();
if (TAVILY_KEY) registry.register(createWebSearchTool(TAVILY_KEY));
```

In the stream `start()`, replace the `streamAnthropic`/`streamGemini` calls:

```ts
const emit = (event: Record<string, unknown>) => controller.enqueue(sseEncode(event));
const deadlineMs = Date.now() + 100_000;

if (provider === 'anthropic') {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  ({ tokensIn, tokensOut, model } = await runAnthropic({
    apiKey: ANTHROPIC_KEY, model: pickAnthropicModel(body),
    system: buildSystem(body), messages: toAnthropicMessages(body),
    registry, emit, deadlineMs,
  }));
} else {
  if (!GOOGLE_KEY) throw new Error('GOOGLE_API_KEY not set');
  ({ tokensIn, tokensOut, model } = await runGemini({
    apiKey: GOOGLE_KEY, model: pickGeminiModel(body),
    system: buildSystem(body), messages: toGeminiContents(body),
    registry, emit, deadlineMs,
  }));
}
```

`pickAnthropicModel` / `pickGeminiModel` / `buildSystem` / `toAnthropicMessages` / `toGeminiContents` are the existing model-pick + message-mapping snippets from the old inline functions, kept as small helpers in `index.ts`. `buildSystem` additionally appends, only when `registry.size > 0`:
`"\n\nIf a web search fails, answer from your own knowledge and say the search failed."`

- [ ] **Step 2: Run full edge test suite**

Run: `deno test supabase/functions/_shared/`
Expected: all pass (registry 4, tavily 3, anthropic 4, gemini 4).

- [ ] **Step 3: Deploy + smoke test**

```bash
supabase secrets set TAVILY_API_KEY=tvly-...
supabase functions deploy chat-cloud
```

Smoke: from the app (or curl with a user JWT), ask "what's the weather in Delhi today?" → response streams, mentions live data.

- [ ] **Step 4: Update docs**

SETUP.md §3 add: `supabase secrets set TAVILY_API_KEY=tvly-...   # optional; enables web search tool`.
README Features add: `- Agentic web search (Tavily) on cloud chats — model decides when to search; sources shown in-chat`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/chat-cloud/index.ts SETUP.md README.md
git commit -m "feat: wire chat-cloud to agentic tool loops"
```

---

### Task 6: Client stream types, SSE extraction, tool-event collection

**Files:**
- Modify: `src/llm/types.ts` (StreamEvent union + ToolEventRecord)
- Create: `src/llm/sse.ts` (pure parser extracted from `cloud.ts`)
- Modify: `src/llm/cloud.ts` (use `feedSse`)
- Modify: `src/llm/chat.ts` (collect + persist tool events)
- Modify: `src/store/messages.ts` (streaming tool activity)
- Create: `jest.config.js`, Test: `src/llm/__tests__/sse.test.ts`
- Modify: `package.json` (jest-expo devDeps + `"test": "jest"`)

**Interfaces:**
- Produces:

```ts
// types.ts additions
export type ToolCallEvent = { type: 'tool_call'; id: string; name: string; query: string };
export type ToolResultEvent = {
  type: 'tool_result'; id: string; count: number; domains: string[];
  results: { title: string; url: string }[]; error?: string;
};
// StreamEvent union gains both members.
export type ToolEventRecord = {
  id: string; name: string; query: string;
  status: 'running' | 'done' | 'error' | 'interrupted';
  count?: number; domains?: string[]; results?: { title: string; url: string }[]; error?: string;
};

// sse.ts
export function feedSse(buffer: string, chunk: string, onEvent: StreamHandler): string; // returns remaining buffer

// store/messages.ts additions
streamingTool: Record<string, ToolEventRecord | null>;
setStreamingTool: (conversationId: string, t: ToolEventRecord | null) => void;
```

- [ ] **Step 1: Add jest-expo**

Run: `npx expo install jest-expo jest @types/jest`
`package.json` scripts: `"test": "jest"`. `jest.config.js`:

```js
module.exports = { preset: 'jest-expo', testMatch: ['**/__tests__/**/*.test.ts'] };
```

- [ ] **Step 2: Write failing parser test**

`src/llm/__tests__/sse.test.ts`:

```ts
import { feedSse } from '../sse';
import type { StreamEvent } from '../types';

const collect = (chunks: string[]) => {
  const events: StreamEvent[] = [];
  let buf = '';
  for (const c of chunks) buf = feedSse(buf, c, (e) => events.push(e));
  return events;
};

test('parses token events across chunk boundaries', () => {
  const events = collect(['data: {"type":"token","te', 'xt":"hi"}\n\n']);
  expect(events).toEqual([{ type: 'token', text: 'hi' }]);
});

test('parses tool_call and tool_result', () => {
  const events = collect([
    'data: {"type":"tool_call","id":"tu_1","name":"web_search","query":"w"}\n\n',
    'data: {"type":"tool_result","id":"tu_1","count":1,"domains":["a.com"],"results":[{"title":"T","url":"https://a.com"}]}\n\n',
  ]);
  expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result']);
});

test('ignores malformed lines and unknown-but-valid JSON passes through', () => {
  const events = collect(['data: {not json}\n\ndata: {"type":"future_thing"}\n\n']);
  expect(events).toEqual([{ type: 'future_thing' } as unknown as StreamEvent]);
});
```

- [ ] **Step 3: Run test, verify fail**

Run: `npm test -- sse`
Expected: FAIL — `../sse` not found.

- [ ] **Step 4: Implement `sse.ts`, extend `types.ts`, refactor `cloud.ts`**

`sse.ts` — the exact `\n\n`-splitting/`data:`-prefix logic currently inline in `cloud.ts:64-80`, as a pure function:

```ts
import type { StreamHandler } from './types';

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
```

`types.ts`: add `ToolCallEvent` / `ToolResultEvent` / `ToolEventRecord` per the Interfaces block; extend `StreamEvent` union.
`cloud.ts`: replace the inline while-loop body with `buf = feedSse(buf, decoder.decode(value, { stream: true }), onEvent);`.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- sse && node_modules/.bin/tsc --noEmit`
Expected: 3 pass; tsc clean.

- [ ] **Step 6: Collect tool events in `chat.ts` and store**

`store/messages.ts`: add `streamingTool` record + `setStreamingTool` (same pattern as `setStreaming`/`clearStreaming`; `clearStreaming` also nulls `streamingTool[conversationId]`).

`chat.ts` `sendMessage`: beside `acc`, add `const toolEvents: ToolEventRecord[] = [];`. Extend `onEvent`:

```ts
} else if (e.type === 'tool_call') {
  const rec: ToolEventRecord = { id: e.id, name: e.name, query: e.query, status: 'running' };
  toolEvents.push(rec);
  ms.setStreamingTool(conversationId, rec);
} else if (e.type === 'tool_result') {
  const rec = toolEvents.find((t) => t.id === e.id);
  if (rec) {
    rec.status = e.error ? 'error' : 'done';
    rec.count = e.count; rec.domains = e.domains; rec.results = e.results; rec.error = e.error;
    ms.setStreamingTool(conversationId, { ...rec });
  }
}
```

Before persisting the assistant message: mark any still-`running` records as `'interrupted'`. Persist: `tool_events: toolEvents.length ? toolEvents : null` in the insert at `chat.ts:119`. On the local→cloud retry path, reset `toolEvents.length = 0` beside `acc = ''`.

- [ ] **Step 7: Typecheck + lint**

Run: `node_modules/.bin/tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add jest.config.js package.json package-lock.json src/llm/ src/store/messages.ts
git commit -m "feat: client tool-event stream handling and persistence"
```

---

### Task 7: ToolChip UI + Sources footer + chat screen wiring

**Files:**
- Create: `src/components/ToolChip.tsx`
- Create: `src/components/sources.ts` (pure `matchCitedSources`)
- Test: `src/components/__tests__/sources.test.ts`
- Modify: `src/components/MessageBubble.tsx` (toolEvents prop)
- Modify: `app/chat/[id].tsx` (streaming ToolChip + toolEvents on persisted messages)

**Interfaces:**
- Consumes: `ToolEventRecord` from Task 6; `useTheme`/`Text` from existing `src/theme`, `src/ui`.
- Produces:
  - `function matchCitedSources(answer: string, results: {title: string; url: string}[]): {title: string; url: string}[]` — returns results whose hostname or title (case-insensitive) appears as a substring of `answer`.
  - `<ToolChip event={ToolEventRecord} />` — states: running (spinner + "Searching: {query}"), done (`Searched web · {count} sources ({first 2 domains}…)`, tap to expand title+URL list, URLs open via `expo-web-browser`), error ("Search failed"), interrupted ("Search interrupted").
  - `MessageBubble` gains optional `toolEvents?: ToolEventRecord[] | null` — renders ToolChips above text and a "Sources" footer from `matchCitedSources(content, allResults)`, omitted when empty.

- [ ] **Step 1: Write failing `matchCitedSources` test**

```ts
import { matchCitedSources } from '../sources';

const results = [
  { title: 'BBC Weather Delhi', url: 'https://bbc.com/weather/delhi' },
  { title: 'Some Blog', url: 'https://obscure.example/post' },
];

test('matches by domain substring', () => {
  expect(matchCitedSources('Per bbc.com it will rain.', results)).toEqual([results[0]]);
});

test('matches by title substring, case-insensitive', () => {
  expect(matchCitedSources('according to bbc weather delhi...', results)).toEqual([results[0]]);
});

test('no match → empty array', () => {
  expect(matchCitedSources('It will rain.', results)).toEqual([]);
});
```

- [ ] **Step 2: Run, verify fail; implement `sources.ts`**

```ts
export function matchCitedSources(
  answer: string,
  results: { title: string; url: string }[],
): { title: string; url: string }[] {
  const text = answer.toLowerCase();
  return results.filter((r) => {
    let host = '';
    try { host = new URL(r.url).hostname.replace(/^www\./, ''); } catch { /* skip */ }
    return (host && text.includes(host)) || (r.title && text.includes(r.title.toLowerCase()));
  });
}
```

Run: `npm test -- sources` → 3 pass.

- [ ] **Step 3: Build `ToolChip.tsx`**

Presentational component: `useState(expanded)`; running state uses existing `TypingDots`-style pulse (reuse `ActivityIndicator` from RN, `size="small"`, color `c.accent`); container styled like existing chips (`backgroundColor: c.accentSoft`, `borderRadius: r.pill`, padding `s['2']`/`s['3']`); expanded list renders `Pressable` rows calling `WebBrowser.openBrowserAsync(url)`; `accessibilityRole="button"`, `accessibilityLabel={\`Web search: ${event.query}\`}`. Status copy exactly: "Searching: {query}", "Searched web · {count} sources ({domains[0]}, {domains[1]}…)", "Search failed", "Search interrupted".

- [ ] **Step 4: Extend `MessageBubble` + wire `app/chat/[id].tsx`**

`MessageBubble`: new optional prop `toolEvents`; when present on an assistant bubble, render `<ToolChip event={e} />` per record above the `Text` content, and after the route/model line a "Sources" block: `matchCitedSources(content, toolEvents.flatMap(t => t.results ?? []))` → up to 3 `Pressable` title links; render nothing when the match is empty.

`app/chat/[id].tsx`: pass `toolEvents={msg.tool_events as ToolEventRecord[] | null}` for persisted messages; while streaming, render `<ToolChip>` from `useMessages((s) => s.streamingTool[id])` above the streaming bubble.

- [ ] **Step 5: Full check**

Run: `npm test && node_modules/.bin/tsc --noEmit && npm run lint`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/ app/chat/
git commit -m "feat: tool chip UI with expandable sources"
```

---

### Task 8: Native-dep batching + dev client rebuild

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: dev client containing `whisper.rn` and `@op-engineering/op-sqlite` native modules, ready for v2.2 (voice) and v2.3 (offline RAG). No JS usage yet — install only.

- [ ] **Step 1: Install**

Run: `npx expo install whisper.rn @op-engineering/op-sqlite`
(expo install picks SDK-54-compatible versions.)

- [ ] **Step 2: Verify config plugins / prebuild sanity**

Run: `npx expo prebuild --platform android --no-install --clean` then `git status` — confirm only `android/` (gitignored) generated; delete it after check (`trash android`). No app.json plugin entries are needed for either lib (autolinking).

- [ ] **Step 3: Typecheck + commit**

Run: `node_modules/.bin/tsc --noEmit`

```bash
git add package.json package-lock.json
git commit -m "chore: add whisper.rn and op-sqlite natives for v2.2/v2.3"
```

- [ ] **Step 4: Rebuild dev client**

Run: `eas build --profile development --platform android`
Install on device when done. (iOS dev client deferred — Android is the active target.)

---

### Task 9: End-to-end verification pass

**Files:** none (manual checklist + fixes if found)

- [ ] **Step 1: Deploy everything current**

```bash
supabase functions deploy chat-cloud
```

- [ ] **Step 2: Device checklist (dev client, cloud route forced)**

- Ask "What happened in tech news today?" → chip shows "Searching: …" → collapses to "Searched web · N sources"; tap expands; links open in browser.
- Kill network mid-search (airplane mode) → chip "Search interrupted", partial text preserved.
- Ask question needing no search ("write a haiku") → no chip, normal stream.
- Reload conversation → chips render from persisted `tool_events`.
- Switch provider to Gemini in settings → repeat first check.
- Local route ("hi" with model downloaded) → no tools involved, unchanged.

- [ ] **Step 3: Full test suite**

Run: `deno test supabase/functions/_shared/ && npm test && node_modules/.bin/tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 4: Final commit + push**

```bash
git push
```
