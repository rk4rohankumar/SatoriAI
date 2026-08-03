/**
 * Naive ~512-token chunker (≈2000 chars) with 100-char overlap.
 * Replace with semantic chunking later.
 */
export function chunkText(text: string, size = 2000, overlap = 100): string[] {
  const out: string[] = [];
  let i = 0;
  const clean = text.replace(/\s+/g, ' ').trim();
  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    out.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = end - overlap;
  }
  return out;
}
