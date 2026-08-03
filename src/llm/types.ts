export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ToolCallEvent = { type: 'tool_call'; id: string; name: string; query: string };
export type ToolResultEvent = {
  type: 'tool_result';
  id: string;
  count: number;
  domains: string[];
  results: { title: string; url: string }[];
  error?: string;
};

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; tokensIn?: number; tokensOut?: number; model?: string }
  | { type: 'error'; message: string }
  | ToolCallEvent
  | ToolResultEvent;

export type StreamHandler = (e: StreamEvent) => void;

/** Client-side record of a single tool invocation's lifecycle, for UI + persistence. */
export type ToolEventRecord = {
  id: string;
  name: string;
  query: string;
  status: 'running' | 'done' | 'error' | 'interrupted';
  count?: number;
  domains?: string[];
  results?: { title: string; url: string }[];
  error?: string;
};

export type LLMRoute = 'local' | 'cloud';

export type ChatRequest = {
  messages: ChatMessage[];
  conversationId: string;
  /** Pre-retrieved RAG chunks (already top-k by retrieve fn). */
  ragContext?: string;
  /** User-explicit override; otherwise router decides. */
  preferredRoute?: LLMRoute;
  /** Cloud provider hint when route resolves to cloud. */
  cloudProvider?: 'anthropic' | 'gemini';
  signal?: AbortSignal;
};

export type LLMProvider = {
  /** Streams tokens via onEvent. Resolves on done/error. */
  chat: (req: ChatRequest, onEvent: StreamHandler) => Promise<void>;
};
