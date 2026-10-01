// Shared image-URL helpers.
//
// Admins paste free-form text into image-URL fields, and a bad value (e.g.
// "123") makes next/image throw at render time ("Failed to parse src..."), which
// crashes the whole page. So we validate on input AND defensively normalize at
// render — a render must never receive an unusable src.

// A real, remotePatterns-allowlisted placeholder (see next.config.ts). next/image
// resizes it to the component's width/height, so one size works everywhere. The
// /png path matters: placehold.co serves SVG by default, which Next's image
// optimizer refuses (400) unless images.dangerouslyAllowSVG is set.
export const PLACEHOLDER_IMAGE = 'https://placehold.co/400x320/png?text=No+Image';

// The usable form of `url` — trimmed, and either a site-local "/path" or a
// syntactically valid absolute http(s) URL — or null. "//host/x" and "/\host/x"
// start with "/" but are protocol-relative (another host), which next/image
// rejects, so they are not site-local.
function usableImageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) {
    return trimmed.startsWith('//') || trimmed.startsWith('/\\') ? null : trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      new URL(trimmed);
      return trimmed;
    } catch {
      return null;
    }
  }
  return null; // e.g. "123", "foo.png", "ftp://..."
}

// True when `url` is acceptable for an optional image field: empty (no image),
// a site-local "/path", or a syntactically valid absolute http(s) URL. Used by
// form validation and the Zod schemas to reject junk like "123".
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (url == null || url.trim() === '') return true; // empty is allowed (the field is optional)
  return usableImageUrl(url) !== null;
}

// Returns a src that next/image can always render: the URL when usable, else a
// placeholder. Never throws and never returns a junk value.
export function getValidImageUrl(
  url: string | null | undefined,
  fallback: string = PLACEHOLDER_IMAGE,
): string {
  return (url && usableImageUrl(url)) || fallback;
}
