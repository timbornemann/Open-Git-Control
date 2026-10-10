import { protocol } from 'electron';
import { HTML_PREVIEW_RESPONSE_CSP, HTML_PREVIEW_SCHEME, MAX_HTML_PREVIEW_BYTES, isHtmlPreviewUrl } from '../../src/shared/htmlPreviewSecurity';

export function registerHtmlPreviewScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: HTML_PREVIEW_SCHEME, privileges: { standard: true, secure: true } }]);
}

export function htmlPreviewResponse(request: { url: string; method: string }): Response {
  const respond = (body: string, status = 200) =>
    new Response(body, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': HTML_PREVIEW_RESPONSE_CSP,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  if (request.method !== 'GET' || request.url.length > MAX_HTML_PREVIEW_BYTES * 3 + 256 || !isHtmlPreviewUrl(request.url)) {
    return respond('Invalid HTML preview request.', 400);
  }
  const values = new URL(request.url).searchParams.getAll('document');
  if (values.length !== 1) return respond('Invalid HTML preview document.', 400);
  if (new TextEncoder().encode(values[0]).byteLength > MAX_HTML_PREVIEW_BYTES) return respond('HTML preview is too large.', 413);
  return respond(values[0]);
}

export function installHtmlPreviewProtocol(): void {
  protocol.handle(HTML_PREVIEW_SCHEME, htmlPreviewResponse);
}
