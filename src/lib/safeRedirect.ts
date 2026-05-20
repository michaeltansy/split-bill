// Returns a safe same-origin relative path or the fallback. Blocks open-redirect
// vectors: absolute URLs, protocol-relative (//evil.com), and backslash tricks.
export function safeRedirect(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  // Must start with a single slash and not be protocol-relative.
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\')) return fallback;
  return raw;
}
