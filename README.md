# SatoriAI

Hybrid local + cloud AI chat app for Android and iOS. Cloud chats run on Claude / Gemini with agentic web search; offline (or without cloud consent) it falls back to on-device Gemma 3 4B via `llama.rn`. Prompts with document context are relayed through Supabase Edge Functions. Upload PDFs and chat over them with pgvector-backed retrieval.

## 📲 Install (Android)

**[Download the APK — latest release](https://github.com/rk4rohankumar/SatoriAI/releases/latest)**

1. Download `SatoriAI-v1.0.0.apk` on your Android phone
2. Open it — allow "install from unknown sources" when prompted
3. First launch can download the on-device model (~2.5 GB, Wi-Fi recommended); cloud chat works immediately

iOS: no prebuilt binary (Apple requires a paid developer account for distribution). Build it yourself — see below.

## Stack

- **Mobile:** Expo SDK 54, React Native 0.81, TypeScript, expo-router
- **Local LLM:** `llama.rn` + Gemma 3 4B (Q4_K_M GGUF, ~2.5 GB, downloaded on first run; offline fallback)
- **Backend:** Supabase — Postgres + pgvector, Auth, Storage, Edge Functions
- **Cloud LLM:** Claude Haiku 4.5 / Sonnet 4.6, Gemini 2.5 Flash / Pro
- **Embeddings:** Gemini `text-embedding-004` (768-dim), HNSW cosine index

## Features

- Email auth (Supabase, RLS-isolated per user)
- Streaming chat with conversation history
- Cloud-first routing (`src/llm/router.ts`): explicit choice wins; cloud when consented, on-device Gemma as offline/no-consent fallback (auto-fallback both directions on failure)
- Library: PDF upload → chunk → embed → pgvector retrieval
- Agentic web search (Tavily) on cloud chats — model decides when to search; sources shown in-chat
- Soft daily cap on cloud calls per user

## Run it yourself (devs)

You need your own free [Supabase](https://supabase.com) project plus Anthropic and/or Google API keys.

```bash
git clone https://github.com/rk4rohankumar/SatoriAI.git && cd SatoriAI
npm install
cp .env.example .env        # fill in your Supabase URL + publishable anon key
```

Backend (one-time):

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                                   # schema + pgvector + RLS
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GOOGLE_API_KEY=AIza...
supabase functions deploy chat-cloud ingest-doc retrieve
```

Mobile — `llama.rn` is a native module, so **Expo Go won't work**; build a dev client:

```bash
npm i -g eas-cli && eas login
eas build --profile development --platform android   # or ios (simulator supported)
npm run start                                        # then open in the dev client
```

Full walkthrough in [SETUP.md](SETUP.md). Design system in [DESIGN.md](DESIGN.md).

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

## Release builds

```bash
eas build --profile preview --platform android      # installable APK
eas build --profile production --platform all       # store builds
```

`eas.json` build profiles embed the public client env (`EXPO_PUBLIC_*`) — swap those values for your own Supabase project when forking. Only the publishable anon key ships in the app; all provider API keys live server-side in Edge Function secrets.

## License

MIT
