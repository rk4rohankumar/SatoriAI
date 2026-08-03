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
