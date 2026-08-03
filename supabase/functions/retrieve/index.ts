import { authenticate } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { embedQuery } from '../_shared/embed.ts';

type Body = {
  query: string;
  match_count?: number;
  document_ids?: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let caller: Awaited<ReturnType<typeof authenticate>>;
  try {
    caller = await authenticate(req);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = (await req.json()) as Body;
  if (!body.query?.trim()) {
    return new Response(JSON.stringify({ error: 'empty query' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const queryEmbedding = await embedQuery(body.query);
  const { data, error } = await caller.adminClient.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_user_id: caller.userId,
    match_count: body.match_count ?? 6,
    filter_document_ids: body.document_ids ?? null,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ chunks: data ?? [] }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
