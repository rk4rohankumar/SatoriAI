/** Pure matching logic for the "Sources" footer: which tool results does the answer actually cite? */
export function matchCitedSources(
  answer: string,
  results: { title: string; url: string }[],
): { title: string; url: string }[] {
  const text = answer.toLowerCase();
  return results.filter((r) => {
    let host = '';
    try {
      host = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      /* skip malformed URLs */
    }
    return (host && text.includes(host)) || (r.title && text.includes(r.title.toLowerCase()));
  });
}
