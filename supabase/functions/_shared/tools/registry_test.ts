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

Deno.test({
  name: 'slow tool times out',
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const r = new ToolRegistry();
    r.register({
      definition: { name: 'slow', description: '', input_schema: {} },
      execute: () => new Promise((resolve) => setTimeout(() => resolve({ success: true, content: 'late' }), 200)),
    });
    const res = await r.execute('slow', {}, 50);
    assertEquals(res.success, false);
  },
});
