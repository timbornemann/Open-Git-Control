// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { buildSandboxedHtmlPreviewDocument, collectHtmlPreviewAssets, isHtmlFilePath } from '@/utils/htmlPreview';

describe('HTML preview helpers', () => {
  it('detects supported HTML files', () => {
    expect(isHtmlFilePath('index.html')).toBe(true);
    expect(isHtmlFilePath('docs/page.HTM')).toBe(true);
    expect(isHtmlFilePath('README.md')).toBe(false);
  });

  it('collects only repository-bound HTML assets', () => {
    expect(
      collectHtmlPreviewAssets(
        '<link rel="stylesheet" href="./site.css"><script src="./app.js"></script><img src="../logo.png"><script src="https://example.test/x.js"></script>',
        'pages/demo/index.html',
      ),
    ).toEqual([
      { kind: 'style', path: 'pages/demo/site.css' },
      { kind: 'script', path: 'pages/demo/app.js' },
      { kind: 'image', path: 'pages/logo.png' },
    ]);
  });

  it('inlines local assets and blocks external resources and navigation', () => {
    const preview = buildSandboxedHtmlPreviewDocument(
      '<html><head><base href="https://example.test/"><link rel="stylesheet" href="site.css"></head><body><img src="logo.png" srcset="remote.png 2x"><a href="https://example.test">External</a><a href="#leistungen">Internal</a><iframe src="https://example.test"></iframe><script src="app.js"></script></body></html>',
      'index.html',
      {
        styles: { 'site.css': 'body { color: rgb(1, 2, 3); }' },
        scripts: { 'app.js': 'window.previewWasLoaded = true;' },
        images: { 'logo.png': 'data:image/png;base64,AAAA' },
      },
    );
    const document = new DOMParser().parseFromString(preview, 'text/html');

    expect(document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("connect-src 'none'");
    expect(document.querySelector('style')?.textContent).toContain('color: rgb(1, 2, 3)');
    expect(Array.from(document.querySelectorAll('script')).some((script) => script.textContent?.includes('previewWasLoaded'))).toBe(true);
    expect(Array.from(document.querySelectorAll('script')).some((script) => script.textContent?.includes('scrollIntoView'))).toBe(true);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(document.querySelector('img')?.hasAttribute('srcset')).toBe(false);
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(document.querySelector('a[href="#leistungen"]')).not.toBeNull();
  });
});
