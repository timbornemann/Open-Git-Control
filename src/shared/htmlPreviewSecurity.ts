export const HTML_PREVIEW_SCHEME = 'ogc-html-preview';
export const HTML_PREVIEW_BASE_URL = `${HTML_PREVIEW_SCHEME}://document/`;
export const MAX_HTML_PREVIEW_BYTES = 16 * 1024 * 1024;

export const HTML_PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "media-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// The response header enforces the sandbox as well as the iframe attribute.
// A preview never acquires the application origin, Node access or networking.
export const HTML_PREVIEW_RESPONSE_CSP = `${HTML_PREVIEW_CSP}; sandbox allow-scripts`;

export function buildHtmlPreviewUrl(document: string): string {
  if (new TextEncoder().encode(document).byteLength > MAX_HTML_PREVIEW_BYTES) {
    throw new Error('HTML preview exceeds the 16 MiB size limit.');
  }
  return `${HTML_PREVIEW_BASE_URL}?${new URLSearchParams({ document })}`;
}

export function isHtmlPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === `${HTML_PREVIEW_SCHEME}:` &&
      parsed.hostname === 'document' &&
      parsed.pathname === '/' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
    );
  } catch {
    return false;
  }
}
