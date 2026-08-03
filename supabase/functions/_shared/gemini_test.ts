import { assertEquals } from 'jsr:@std/assert';
import { runGemini } from './gemini.ts';
import { ToolRegistry } from './tools/registry.ts';

function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(new Blob([body]).stream(), { status: 200 });
}

// Gemini's streamGenerateContent?alt=sse endpoint frames real events with
// CRLF (\r\n\r\n) rather than LF-only.
function sseResponseCRLF(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('');
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

const G_TEXT = [
  { candidates: [{ content: { parts: [{ text: 'hi' }] } }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 } },
];
const G_TOOL = [
  { candidates: [{ content: { parts: [{ functionCall: { name: 'web_search', args: { query: 'weather' } } }] } }] },
];

Deno.test('text-only passthrough emits tokens', async () => {
  const events: Record<string, unknown>[] = [];
  const res = await runGemini({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', parts: [{ text: 'hi' }] }],
    registry: new ToolRegistry(),
    emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponse(G_TEXT)]),
  });
  assertEquals(events.filter((e) => e.type === 'token').length, 1);
  assertEquals(res.tokensIn, 8);
});

Deno.test('CRLF-framed SSE (\\r\\n\\r\\n): emits token and accumulates usage', async () => {
  const events: Record<string, unknown>[] = [];
  const res = await runGemini({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', parts: [{ text: 'hi' }] }],
    registry: new ToolRegistry(),
    emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponseCRLF(G_TEXT)]),
  });
  assertEquals(events.filter((e) => e.type === 'token').length, 1);
  assertEquals(events.find((e) => e.type === 'token')?.text, 'hi');
  assertEquals(res.tokensIn, 8);
  assertEquals(res.tokensOut, 4);
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
  await runGemini({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', parts: [{ text: 'weather?' }] }],
    registry, emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponse(G_TOOL), sseResponse(G_TEXT)]),
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
  await runGemini({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', parts: [{ text: 'weather?' }] }],
    registry, emit: (e) => events.push(e),
    fetchFn: scriptedFetch([sseResponse(G_TOOL), sseResponse(G_TEXT)]),
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
  // 2 tool rounds scripted, then final text; with maxRounds 2 the 3rd fetch must
  // be the forced-final round (tools omitted → we script G_TEXT there).
  await runGemini({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', parts: [{ text: 'weather?' }] }],
    registry, emit: (e) => events.push(e), maxRounds: 2,
    fetchFn: scriptedFetch([sseResponse(G_TOOL), sseResponse(G_TOOL), sseResponse(G_TEXT)]),
  });
  assertEquals(events.filter((e) => e.type === 'tool_call').length, 2);
});

Deno.test('forced-final request after maxRounds still sends tools + toolConfig mode NONE', async () => {
  const registry = new ToolRegistry();
  registry.register({
    definition: { name: 'web_search', description: '', input_schema: {} },
    execute: () => Promise.resolve({ success: true, content: 'x', metadata: { results: [] } }),
  });
  const calls: Record<string, unknown>[] = [];
  await runGemini({
    apiKey: 'k', model: 'm', system: undefined,
    messages: [{ role: 'user', parts: [{ text: 'weather?' }] }],
    registry, emit: () => {}, maxRounds: 2,
    fetchFn: scriptedFetchCapturing(
      [sseResponse(G_TOOL), sseResponse(G_TOOL), sseResponse(G_TEXT)],
      calls,
    ),
  });
  assertEquals(calls.length, 3);
  // Round 1 and 2 request bodies must include tools with no toolConfig override.
  assertEquals(Array.isArray(calls[0].tools), true);
  assertEquals(calls[0].toolConfig, undefined);
  assertEquals(Array.isArray(calls[1].tools), true);
  assertEquals(calls[1].toolConfig, undefined);
  // Forced-final round (3rd request, round >= maxRounds) must still define `tools`
  // (since prior contents contain functionCall/functionResponse parts) and force
  // text-only via toolConfig.functionCallingConfig.mode = 'NONE'.
  assertEquals(Array.isArray(calls[2].tools), true);
  assertEquals(calls[2].toolConfig, { functionCallingConfig: { mode: 'NONE' } });
});
