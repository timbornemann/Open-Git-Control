import { describe, expect, it, vi } from 'vitest';
import { htmlPreviewResponse, installHtmlPreviewProtocol, registerHtmlPreviewScheme } from '../htmlPreviewProtocol';
import { HTML_PREVIEW_BASE_URL, HTML_PREVIEW_RESPONSE_CSP, MAX_HTML_PREVIEW_BYTES, buildHtmlPreviewUrl } from '../../../src/shared/htmlPreviewSecurity';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }));
vi.mock('electron', () => ({ protocol: mocks }));

describe('isolated HTML preview protocol', () => {
  it('registers a separate secure scheme without bypassing CSP or allowing service workers', () => {
    registerHtmlPreviewScheme();
    installHtmlPreviewProtocol();
    expect(mocks.registerSchemesAsPrivileged).toHaveBeenCalledWith([{ scheme: 'ogc-html-preview', privileges: { standard: true, secure: true } }]);
    expect(mocks.handle).toHaveBeenCalledWith('ogc-html-preview', htmlPreviewResponse);
  });

  it('round-trips Unicode and special characters under a compulsory sandbox', async () => {
    const document = '<h1>Änderung + # & ? 中文</h1><script>window.preview = true;</script>';
    const response = htmlPreviewResponse({ url: buildHtmlPreviewUrl(document), method: 'GET' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(document);
    expect(response.headers.get('content-security-policy')).toBe(HTML_PREVIEW_RESPONSE_CSP);
    expect(response.headers.get('content-security-policy')).toContain('sandbox allow-scripts');
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    'file:///outside.html?document=content',
    'ogc-html-preview://other/?document=content',
    'ogc-html-preview://user:password@document/?document=content',
    'ogc-html-preview://document:1234/?document=content',
    'ogc-html-preview://document/outside?document=content',
    HTML_PREVIEW_BASE_URL,
    `${HTML_PREVIEW_BASE_URL}?document=first&document=second`,
  ])('rejects invalid preview requests: %s', async (url) => {
    const response = htmlPreviewResponse({ url, method: 'GET' });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-security-policy')).toBe(HTML_PREVIEW_RESPONSE_CSP);
    expect(await response.text()).not.toContain('content');
  });

  it('rejects POST and documents over the UTF-8 byte limit on both sides', () => {
    expect(htmlPreviewResponse({ url: buildHtmlPreviewUrl('ok'), method: 'POST' }).status).toBe(400);
    const oversized = 'é'.repeat(MAX_HTML_PREVIEW_BYTES / 2 + 1);
    expect(() => buildHtmlPreviewUrl(oversized)).toThrow('size limit');
    expect(htmlPreviewResponse({ url: `${HTML_PREVIEW_BASE_URL}?document=${oversized}`, method: 'GET' }).status).toBe(413);
  });
});
