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

function scriptedFetchCapturing(responses: Response[], calls: Record<string, unknown>[]): typeof fetch {
  let i = 0;
  return (_url, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? '{}')));
    return Promise.resolve(responses[i++]);
  };
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

Deno.test('forced-final request after maxRounds still sends tools + tool_choice none', async () => {
  const registry = new ToolRegistry();
  registry.register({
    definition: { name: 'web_search', description: '', input_schema: {} },
    execute: () => Promise.resolve({ success: true, content: 'x', metadata: { results: [] } }),
  });
  const calls: Record<string, unknown>[] = [];
  await runAnthropic({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', content: 'weather?' }],
    registry, emit: () => {}, maxRounds: 2,
    fetchFn: scriptedFetchCapturing(
      [sseResponse(TOOL_ROUND), sseResponse(TOOL_ROUND), sseResponse(TEXT_ONLY)],
      calls,
    ),
  });
  assertEquals(calls.length, 3);
  // Round 1 and 2 request bodies must include tools with no tool_choice override.
  assertEquals(Array.isArray(calls[0].tools), true);
  assertEquals(calls[0].tool_choice, undefined);
  assertEquals(Array.isArray(calls[1].tools), true);
  assertEquals(calls[1].tool_choice, undefined);
  // Forced-final round (3rd request, round >= maxRounds) must still define `tools`
  // (since prior messages contain tool_use/tool_result blocks) and force text-only
  // via tool_choice: none.
  assertEquals(Array.isArray(calls[2].tools), true);
  assertEquals(calls[2].tool_choice, { type: 'none' });
});
