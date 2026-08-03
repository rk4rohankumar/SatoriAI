const GOOGLE_KEY = Deno.env.get('GOOGLE_API_KEY')!;

/** Gemini text-embedding-004 → 768-dim vector. */
export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GOOGLE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`embed ${res.status}: ${t}`);
  }
  const j = await res.json();
  return j.embedding.values as number[];
}

export async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GOOGLE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
      }),
    },
  );
  if (!res.ok) throw new Error(`embed query ${res.status}`);
  const j = await res.json();
  return j.embedding.values as number[];
}
