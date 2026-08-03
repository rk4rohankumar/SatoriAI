import type { ToolRegistry } from './tools/registry.ts';
import type { EmitFn, ProviderResult } from './anthropic.ts';

export type { EmitFn, ProviderResult };

type GeminiContent = { role: string; parts: unknown[] };
type FunctionCall = { name: string; args: Record<string, unknown> };

export async function runGemini(opts: {
  apiKey: string;
  model: string;
  system: string | undefined;
  messages: GeminiContent[];
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
    ? [{
        functionDeclarations: opts.registry.listDefinitions().map((d) => ({
          name: d.name, description: d.description, parameters: d.input_schema,
        })),
      }]
    : undefined;

  const contents = [...opts.messages];
  let tokensIn = 0;
  let tokensOut = 0;
  let round = 0;

  while (true) {
    const toolsAllowed = !!tools && round < maxRounds && Date.now() < deadline;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:streamGenerateContent?alt=sse&key=${opts.apiKey}`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: opts.system ? { parts: [{ text: opts.system }] } : undefined,
        generationConfig: { maxOutputTokens: 1024 },
        ...(toolsAllowed ? { tools } : {}),
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(`gemini ${res.status}: ${t}`);
    }

    // parse one streamed response
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const functionCalls: FunctionCall[] = [];
    let roundTokensIn = 0;
    let roundTokensOut = 0;

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
            const parts = p?.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              if (part?.text) {
                opts.emit({ type: 'token', text: part.text });
              } else if (part?.functionCall) {
                functionCalls.push(part.functionCall as FunctionCall);
              }
            }
            if (p?.usageMetadata) {
              roundTokensIn = p.usageMetadata.promptTokenCount ?? roundTokensIn;
              roundTokensOut = p.usageMetadata.candidatesTokenCount ?? roundTokensOut;
            }
          } catch { /* ignore malformed line */ }
        }
      }
    }

    tokensIn += roundTokensIn;
    tokensOut += roundTokensOut;

    if (functionCalls.length === 0) {
      return { tokensIn, tokensOut, model: opts.model };
    }

    // execute tools, append model turn + function responses, next round
    round += 1;
    const results: { success: boolean; content: string }[] = [];

    for (let i = 0; i < functionCalls.length; i++) {
      const fc = functionCalls[i];
      const id = `g_${round}_${i}`;
      opts.emit({ type: 'tool_call', id, name: fc.name, query: String(fc.args?.query ?? '') });

      const result = await opts.registry.execute(fc.name, fc.args ?? {});
      results.push(result);
      // deno-lint-ignore no-explicit-any
      const searchResults = ((result.metadata?.results as any[]) ?? []).map((r) => ({
        title: r.title, url: r.url,
      }));
      const domains = searchResults.map((r) => {
        try { return new URL(r.url).hostname; } catch { return ''; }
      }).filter(Boolean);
      opts.emit({
        type: 'tool_result', id, count: searchResults.length, domains, results: searchResults,
        ...(result.success ? {} : { error: result.content }),
      });
    }

    contents.push({ role: 'model', parts: functionCalls.map((fc) => ({ functionCall: fc })) });
    contents.push({
      role: 'user',
      parts: results.map((r, i) => ({
        functionResponse: {
          name: functionCalls[i].name,
          response: {
            content: r.success
              ? r.content
              : `Search failed: ${r.content}. Answer from your own knowledge and mention the search failed.`,
          },
        },
      })),
    });
  }
}
