// deno-lint-ignore-file no-explicit-any
import { authenticate } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { chunkText } from '../_shared/chunk.ts';
import { embedText } from '../_shared/embed.ts';
// PDF text extraction
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

type Body = { document_id: string };

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

  const { document_id } = (await req.json()) as Body;
  const { adminClient, userId } = caller;

  // 1) load doc row
  const { data: doc, error } = await adminClient
    .from('documents')
    .select('*')
    .eq('id', document_id)
    .eq('user_id', userId)
    .single();
  if (error || !doc) {
    return new Response(JSON.stringify({ error: 'doc not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  await adminClient.from('documents').update({ status: 'processing', error: null }).eq('id', doc.id);

  try {
    // 2) download from storage
    const { data: blob, error: dlErr } = await adminClient.storage
      .from('documents')
      .download(doc.storage_path);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download failed');

    // 3) extract text
    let fullText = '';
    if ((doc.mime ?? '').includes('pdf')) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const out = await extractText(pdf, { mergePages: true });
      fullText = typeof out.text === 'string' ? out.text : (out.text as string[]).join('\n');
    } else {
      fullText = await blob.text();
    }
    if (!fullText.trim()) throw new Error('no text extracted');

    // 4) chunk
    const chunks = chunkText(fullText);

    // 5) embed + insert (batch in groups of 5)
    const rows: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const emb = await embedText(chunks[i]);
      rows.push({
        document_id: doc.id,
        user_id: userId,
        idx: i,
        content: chunks[i],
        embedding: emb,
      });
      if (rows.length >= 20) {
        await adminClient.from('chunks').insert(rows);
        rows.length = 0;
      }
    }
    if (rows.length) await adminClient.from('chunks').insert(rows);

    await adminClient
      .from('documents')
      .update({ status: 'ready' })
      .eq('id', doc.id);

    return new Response(JSON.stringify({ ok: true, chunks: chunks.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await adminClient
      .from('documents')
      .update({ status: 'error', error: msg })
      .eq('id', doc.id);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
