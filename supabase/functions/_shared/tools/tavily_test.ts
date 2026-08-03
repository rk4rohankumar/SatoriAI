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
