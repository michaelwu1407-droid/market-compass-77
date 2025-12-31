export function extractEtoroUsername(raw: unknown): string {
  let s = String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

  if (!s) return '';

  // Normalize Unicode shape (helps with lookalike chars / odd inputs)
  try {
    // deno supports String.prototype.normalize
    s = s.normalize('NFKC');
  } catch {
    // ignore
  }

  // If it's a URL, take the last path segment.
  // Common patterns: https://www.etoro.com/people/<username>
  const lower = s.toLowerCase();
  if (lower.includes('etoro.com')) {
    try {
      const u = new URL(s);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        s = parts[parts.length - 1] ?? s;
      }
    } catch {
      // fall through
    }
  }

  // If it contains /people/<username>, extract that.
  const peopleMatch = s.match(/\/people\/([^/?#]+)/i);
  if (peopleMatch?.[1]) s = peopleMatch[1];

  // Strip leading @ (sometimes multiple)
  s = s.replace(/^@+/, '').trim();

  // Strip trailing punctuation that often comes from copy/paste.
  s = s.replace(/[\s\u00A0]+/g, ' ').trim();
  s = s.replace(/[.,;:!?)\]}>]+$/g, '').trim();

  return s;
}

export function normalizeEtoroUsernameKey(raw: unknown): string {
  const extracted = extractEtoroUsername(raw);
  return extracted ? extracted.toLowerCase() : '';
}
