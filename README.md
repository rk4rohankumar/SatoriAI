# SatoriAI

Hybrid local + cloud AI chat app for iOS and Android. Short prompts run on-device (Gemma 3 1B via `llama.rn`); longer or RAG-augmented prompts are relayed to Claude / Gemini through Supabase Edge Functions. Upload PDFs and chat over them with pgvector-backed retrieval.

## Stack

- **Mobile:** Expo SDK 54, React Native 0.81, TypeScript, expo-router
- **Local LLM:** `llama.rn` + Gemma 3 1B (Q4_K_M GGUF, ~700 MB, downloaded on first run)
- **Backend:** Supabase — Postgres + pgvector, Auth, Storage, Edge Functions
- **Cloud LLM:** Claude Haiku 4.5 / Sonnet 4.6, Gemini 2.5 Flash / Pro
- **Embeddings:** Gemini `text-embedding-004` (768-dim), HNSW cosine index

## Features

- Email auth (Supabase)
- Chat with streaming responses, conversation history
- Automatic local/cloud routing (`src/llm/router.ts`) — explicit choice wins; RAG context, long input, or long history routes to cloud
- Library: PDF upload → chunk → embed → retrieve
- Per-user data isolation via RLS; private storage bucket

## Getting started

```bash
npm install
cp .env.example .env   # fill in Supabase URL + anon key, model URL
npm run start
```

`llama.rn` is a native module — Expo Go won't work. Build a dev client first:

```bash
eas build --profile development --platform ios   # or android
```

Full backend setup (Supabase link, migrations, Edge Function secrets and deploys) in [SETUP.md](SETUP.md). Design system in [DESIGN.md](DESIGN.md).

## Project layout

```
app/                # expo-router screens: (auth), (tabs), chat/[id]
src/
  db/               # supabase client + types
  llm/              # local, cloud, router, chat orchestrator
  store/            # zustand stores
  components/ ui/   # chat components, design-system primitives
supabase/
  migrations/       # SQL schema
  functions/        # chat-cloud, ingest-doc, retrieve (+ _shared)
```

## Builds

```bash
eas build --profile preview --platform android      # installable APK, shareable link
eas build --profile production --platform all       # store builds
```
