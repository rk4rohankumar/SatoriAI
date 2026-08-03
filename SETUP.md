# SatoriAI — setup

Mobile RN/Expo app: hybrid local + cloud LLM, Supabase backend, RAG over uploaded PDFs.

## Stack
- **Mobile:** Expo SDK 54, RN 0.81, TypeScript, expo-router
- **Local LLM:** `llama.rn` + Gemma 3 1B (Q4_K_M GGUF, ~700 MB, downloaded post-install)
- **Backend:** Supabase (Postgres + pgvector, Auth, Storage, Realtime, Edge Functions)
- **Cloud LLM:** Claude Haiku 4.5 / Sonnet 4.6 + Gemini 2.5 Flash / Pro
- **Embeddings:** Gemini `text-embedding-004` (768-dim)
- **Vector:** pgvector HNSW (cosine)

## One-time setup

### 1) Supabase CLI auth + link
```bash
supabase login                       # interactive (browser)
supabase link --project-ref btpuxcuvphoccqjqpcok
```

### 2) Push schema to remote
```bash
supabase db push
```

### 3) Set Edge Function secrets
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GOOGLE_API_KEY=AIza...
# optional override (default 100):
supabase secrets set SOFT_DAILY_CAP=100
```

> SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are auto-injected.

### 4) Deploy Edge Functions
```bash
supabase functions deploy chat-cloud
supabase functions deploy ingest-doc
supabase functions deploy retrieve
```

### 5) Local env (mobile)
`.env` is already populated with the Supabase URL + anon key. Update if needed:
```
EXPO_PUBLIC_SUPABASE_URL=https://btpuxcuvphoccqjqpcok.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EXPO_PUBLIC_MODEL_URL=https://huggingface.co/.../gemma-3-1b-it-Q4_K_M.gguf
EXPO_PUBLIC_MODEL_FILENAME=gemma-3-1b-it-Q4_K_M.gguf
```

### 6) Build dev client (required — `llama.rn` is a native module, Expo Go won't work)
```bash
npm i -g eas-cli
eas login
eas build:configure
eas build --profile development --platform ios       # or android
```
Install the resulting build on a physical device, then run:
```bash
npm run start
```

### 7) (later) Optional: rehost the GGUF
HuggingFace is fine for dev. For production, mirror to Supabase Storage or Cloudflare R2 and update `EXPO_PUBLIC_MODEL_URL`.

## Daily dev loop
```bash
npm run start                   # metro
# scan QR with the dev-client app you installed
```

## Generate up-to-date DB types after migrations
```bash
supabase gen types typescript --linked > src/db/types.ts
```

## Project layout
```
app/                          # expo-router screens
  (auth)/                     # sign-in, sign-up
  (tabs)/                     # chats list, library, settings
  chat/[id].tsx               # chat detail w/ streaming
src/
  db/                         # supabase client + types
  llm/                        # local, cloud, router, chat orchestrator
  rag/                        # (future) client-side retrieve helpers
  store/                      # zustand stores
  components/                 # MessageBubble, Composer
supabase/
  migrations/                 # SQL schema
  functions/
    chat-cloud/               # Anthropic/Gemini SSE relay
    ingest-doc/               # PDF → chunks → embeddings
    retrieve/                 # query → top-k chunks
    _shared/                  # cors, auth, chunk, embed helpers
```

## Routing logic (v1)
`src/llm/router.ts` decides local vs cloud:
- explicit user choice wins
- RAG context present → cloud
- input >200 chars → cloud
- history >12 turns → cloud
- otherwise → local Gemma

## Security notes
- **Never** commit the **service role key** or postgres password. Only the publishable anon key goes in `.env`.
- Service role only used inside Edge Functions (auto-injected via Supabase platform secret).
- RLS policies enforce per-user data isolation.
- Storage `documents` bucket is private; per-user folder prefix.

## Known follow-ups
- Apple / Google OAuth (currently email-only)
- Voice (Whisper.rn STT + native TTS)
- Tool use: web search (Tavily), calendar, etc.
- Auto-router v2 (small classifier model)
- Streaming via `eventsource-parser` library if RN fetch streaming flakes
- Replace hand-written `src/db/types.ts` with `supabase gen types`
