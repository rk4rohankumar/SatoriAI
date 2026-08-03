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
