-- SatoriAI initial schema
-- Extensions
create extension if not exists vector;

-- ============================================================
-- profiles (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  cloud_consent boolean default false,
  prefs jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- conversations
-- ============================================================
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

-- ============================================================
-- messages
-- ============================================================
create type public.message_role as enum ('user', 'assistant', 'system');
create type public.message_route as enum ('local', 'cloud');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.message_role not null,
  content text not null,
  route public.message_route,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz default now()
);
create index messages_conv_created_idx
  on public.messages (conversation_id, created_at);
create index messages_user_created_idx
  on public.messages (user_id, created_at desc);

-- ============================================================
-- documents
-- ============================================================
create type public.doc_status as enum ('pending', 'processing', 'ready', 'error');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  mime text,
  size_bytes bigint,
  storage_path text not null,
  status public.doc_status default 'pending',
  error text,
  created_at timestamptz default now()
);
create index documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- ============================================================
-- chunks (RAG)
-- ============================================================
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idx int not null,
  content text not null,
  embedding vector(768)
);
create index chunks_doc_idx on public.chunks (document_id, idx);
create index chunks_user_idx on public.chunks (user_id);
create index chunks_embedding_hnsw
  on public.chunks using hnsw (embedding vector_cosine_ops);

-- ============================================================
-- usage_daily (cost guardrail)
-- ============================================================
create table public.usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  cloud_msgs int default 0,
  tokens_in bigint default 0,
  tokens_out bigint default 0,
  primary key (user_id, day)
);

-- ============================================================
-- triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- create profile row on user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.usage_daily enable row level security;

create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id);

create policy "conv self all" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "msg self all" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "doc self all" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chunks: users can read their own; writes go through edge fn (service role).
create policy "chunk self read" on public.chunks
  for select using (auth.uid() = user_id);

-- usage_daily: users can read; writes via edge fn (service role).
create policy "usage self read" on public.usage_daily
  for select using (auth.uid() = user_id);

-- ============================================================
-- Realtime
-- ============================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- ============================================================
-- Storage: documents bucket (private, per-user folder)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "doc storage self read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "doc storage self insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "doc storage self delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Helper RPC for vector search (called by retrieve edge fn)
-- ============================================================
create or replace function public.match_chunks(
  query_embedding vector(768),
  match_user_id uuid,
  match_count int default 6,
  filter_document_ids uuid[] default null
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  idx int,
  similarity float
)
language sql stable as $$
  select c.id, c.document_id, c.content, c.idx,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.user_id = match_user_id
    and (filter_document_ids is null or c.document_id = any(filter_document_ids))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
