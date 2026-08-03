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
    // Once a tool round has happened, prior messages contain tool_use/tool_result
    // blocks. Anthropic requires `tools` to be defined whenever those blocks are
    // present, even on a forced-final (no-more-tools) round — so keep `tools` and
    // explicitly disable further calls via tool_choice: none instead of omitting it.
    const forceFinal = !toolsAllowed && round > 0 && !!tools;
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
        ...(toolsAllowed
          ? { tools }
          : forceFinal
          ? { tools, tool_choice: { type: 'none' } }
          : {}),
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
