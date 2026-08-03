# Web Search Tool (v2.1) — Design

Date: 2026-08-03
Status: approved (sections reviewed in session)

## Context

First of three v2 subsystems (v2.1 Tools → v2.2 Voice conversation mode → v2.3 Offline on-device RAG). Goal mix: portfolio showcase + learning playground.

Cloud chat gains agentic web search via Tavily. Local Gemma path is untouched — tools are cloud-only. Architecture deliberately mirrors the `learn-ai` project's tool runner (tool registry, SSE event schema, generation lifecycle) so patterns transfer between projects; the learn-ai FastAPI server itself is **not** used as backend (no auth/RLS, no RAG stack, unhosted WIP).

## Architecture & data flow

- Tavily API key stored as Edge Function secret (`supabase secrets set TAVILY_API_KEY=...`).
- `chat-cloud` Edge Function defines a `web_search` tool for both Anthropic and Gemini (native tool-calling on each).
- Server-side agentic loop: model streams → emits `tool_use` → function calls Tavily (top 5 results: title, URL, snippet) → `tool_result` fed back → model continues. Max 3 tool rounds per message.
- Tool layer structured as a registry in `supabase/functions/_shared/tools/` (`base`, `registry`, `execution`, `tavily`) — mirrors learn-ai `tools/` package; its weather tool is the structural template.
- SSE protocol extended beside text deltas:
  - `tool_call {id, name, query}`
  - `tool_result {id, count, domains[]}`
  Event shapes match learn-ai `events/sse.py` so both projects speak one protocol.
- Router unchanged; the model decides when to search.
- Native-dep batching: this phase also adds `whisper.rn` and sqlite-vec dependencies and cuts one new dev-client build that covers the voice (v2.2) and RAG (v2.3) phases.

## Client UI & persistence

**Stream parsing**
- `src/llm/cloud.ts` SSE parser handles `tool_call` / `tool_result`.
- `src/llm/chat.ts` orchestrator exposes them via a new `onToolEvent` callback beside the existing text callback.

**UI**
- New `src/components/ToolChip.tsx`. Rendered by `MessageBubble` above answer text: spinner + "Searching: _query_" while running → collapses to "Searched web · 5 sources (tavily.com, bbc.com…)". Tap → expandable source list; URLs open via `expo-web-browser`.
- Assistant messages get an optional "Sources" footer: result URLs whose domain or title appears in the final answer text (simple substring match). Footer omitted when nothing matches — no LLM-based citation attribution in v2.1.
- `TypingDots` unchanged for pre-first-token wait.

**Persistence**
- Migration: `alter table messages add column tool_events jsonb;` (null for normal messages).
- Edge Function writes the final `tool_events` array when persisting the assistant message; `src/store/messages.ts` reads it back so chips survive reload.
- Regenerate `src/db/types.ts` with `supabase gen types typescript --linked` (retires the hand-written types follow-up).

**Limits UX**
- A tool-using reply counts once against the daily cap (no change).
- Tavily failure → chip shows "Search failed"; reply continues without sources.

## Error handling

**Server**
- Tavily failure or 10s timeout → `tool_result` carries `{error}`; system prompt instructs the model to answer from its own knowledge and note the failure. Stream never dies from a tool error.
- Max 3 tool rounds; exceeding forces a final answer from accumulated context.
- Wall-clock guard: abort the tool loop at ~100s (headroom under Supabase's 150s Edge Function limit) and flush existing text.
- Missing `TAVILY_API_KEY` → tool omitted from definitions entirely; chat works with no search (graceful degradation for forks).

**Client**
- Unknown SSE event types are ignored (forward compatibility).
- Interrupted stream mid-tool → chip shows "Search interrupted", partial text kept, existing retry path applies.

## Testing

- Deno tests for the Edge Function tool loop with mocked Tavily + mocked provider stream: happy path, tool error, 3-round cap, missing key.
- Client unit tests for the SSE parser against recorded fixtures: text-only, with tools, interrupted.
- Manual device pass: airplane mode mid-search, daily-cap behavior, all chip states.

## Non-goals (v2.1)

- No calendar or other tools.
- No tool use on the local Gemma model.
- No inline citation markers ([1]-style rendering).
- No user-facing search on/off toggle.
