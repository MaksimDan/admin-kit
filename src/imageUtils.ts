// Shared image-URL helpers.
//
// Admins paste free-form text into image-URL fields, and a bad value (e.g.
// "123") makes next/image throw at render time ("Failed to parse src..."), which
// crashes the whole page. So we validate on input AND defensively normalize at
// render — a render must never receive an unusable src.

// A real, remotePatterns-allowlisted placeholder (see next.config.ts). next/image
// resizes it to the component's width/height, so one size works everywhere.
export const PLACEHOLDER_IMAGE = 'https://placehold.co/400x320?text=No+Image';

// True when `url` is acceptable for an optional image field: empty (no image),
// a site-local "/path", or a syntactically valid absolute http(s) URL. Used by
// form validation and the Zod schemas to reject junk like "123".
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (url == null) return true;
  const trimmed = url.trim();
  if (trimmed === '') return true; // empty is allowed (the field is optional)
  if (trimmed.startsWith('/')) return true; // site-local asset
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false; // e.g. "123", "foo.png", "ftp://..."
}

// Returns a src that next/image can always render: the URL when usable, else a
// placeholder. Never throws and never returns a junk value.
export function getValidImageUrl(
  url: string | null | undefined,
  fallback: string = PLACEHOLDER_IMAGE,
): string {
  if (!url) return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
