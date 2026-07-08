// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMarkdownPreviewImageDataUrls,
  collectMarkdownPreviewImageSources,
  isExternalMarkdownUrl,
  isMarkdownFilePath,
  renderMarkdownToSanitizedHtml,
  resolveMarkdownPreviewAssetPath,
} from '@/utils/markdownPreview';

const parseBody = (html: string): HTMLElement => new DOMParser().parseFromString(html, 'text/html').body;

describe('markdown preview helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects common Markdown extensions', () => {
    expect(isMarkdownFilePath('README.md')).toBe(true);
    expect(isMarkdownFilePath('docs/guide.markdown')).toBe(true);
    expect(isMarkdownFilePath('docs/CHANGELOG.MKDN')).toBe(true);
    expect(isMarkdownFilePath('docs/.md')).toBe(false);
    expect(isMarkdownFilePath('docs/readme.')).toBe(false);
    expect(isMarkdownFilePath('README')).toBe(false);
    expect(isMarkdownFilePath('notes.txt')).toBe(false);
  });

  it('detects external Markdown resource URLs', () => {
    expect(isExternalMarkdownUrl('https://example.test/image.png')).toBe(true);
    expect(isExternalMarkdownUrl('mailto:test@example.test')).toBe(true);
    expect(isExternalMarkdownUrl('//cdn.example.test/image.png')).toBe(true);
    expect(isExternalMarkdownUrl('  data:image/png;base64,AAAA')).toBe(true);
    expect(isExternalMarkdownUrl('./image.png')).toBe(false);
    expect(isExternalMarkdownUrl('#section')).toBe(false);
    expect(isExternalMarkdownUrl('')).toBe(false);
  });

  it('resolves relative image paths next to the Markdown file', () => {
    expect(resolveMarkdownPreviewAssetPath('docs/guide/readme.md', './images/logo.png')).toBe('docs/guide/images/logo.png');
    expect(resolveMarkdownPreviewAssetPath('docs/guide/readme.md', '../shared/logo.png')).toBe('docs/shared/logo.png');
    expect(resolveMarkdownPreviewAssetPath('docs\\guide\\readme.md', 'images\\logo.png')).toBe('docs/guide/images/logo.png');
  });

  it('resolves repo-root image paths and encoded filenames', () => {
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '/assets/App%20Overview.png')).toBe('assets/App Overview.png');
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', './images/logo.png?raw=1#preview')).toBe('docs/images/logo.png');
    expect(resolveMarkdownPreviewAssetPath('readme.md', 'bad%zz-name.png')).toBe('bad%zz-name.png');
  });

  it('rejects external and outside-repository image paths', () => {
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', 'https://example.test/a.png')).toBeNull();
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '//example.test/a.png')).toBeNull();
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '#diagram')).toBeNull();
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '')).toBeNull();
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '../../secret.png')).toBeNull();
  });

  it('renders Markdown and sanitizes unsafe inline HTML', () => {
    const html = renderMarkdownToSanitizedHtml(
      [
        '# Release Notes',
        '',
        '[External](https://example.test) [Local](./guide.md)',
        '',
        '- [x] shipped',
        '',
        '<script>alert("x")</script>',
        '<form><input type="text" value="unsafe"></form>',
        '<button>Do it</button>',
      ].join('\n'),
    );
    const body = parseBody(html);

    expect(body.querySelector('h1')?.textContent).toBe('Release Notes');
    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('form')).toBeNull();
    expect(body.querySelector('button')).toBeNull();

    const externalLink = body.querySelector('a[href="https://example.test"]');
    expect(externalLink?.getAttribute('target')).toBe('_blank');
    expect(externalLink?.getAttribute('rel')).toBe('noopener noreferrer');

    const localLink = body.querySelector('a[href="./guide.md"]');
    expect(localLink?.getAttribute('target')).toBeNull();
    expect(localLink?.getAttribute('rel')).toBeNull();

    const checkbox = body.querySelector('input[type="checkbox"]');
    expect(checkbox?.getAttribute('disabled')).toBe('disabled');
    expect(body.querySelector('input[type="text"]')).toBeNull();
  });

  it('returns parsed Markdown without sanitizing when no browser window exists', () => {
    vi.stubGlobal('window', undefined);

    expect(renderMarkdownToSanitizedHtml('**Bold**')).toContain('<strong>Bold</strong>');
  });

  it('returns sanitized HTML when DOMParser is unavailable', () => {
    vi.stubGlobal('DOMParser', undefined);

    const html = renderMarkdownToSanitizedHtml('[External](https://example.test)');

    expect(typeof html).toBe('string');
    expect(html).not.toContain('target="_blank"');
  });

  it('collects unique local Markdown image sources', () => {
    const html = [
      '<img src="./assets/screen.png">',
      '<img src="./assets/screen.png">',
      '<img src="https://example.test/remote.png">',
      '<img src="#diagram">',
      '<img alt="empty">',
    ].join('');

    expect(collectMarkdownPreviewImageSources(html)).toEqual(['./assets/screen.png']);
  });

  it('returns no Markdown image sources when DOMParser is unavailable', () => {
    vi.stubGlobal('DOMParser', undefined);

    expect(collectMarkdownPreviewImageSources('<img src="./assets/screen.png">')).toEqual([]);
  });

  it('applies resolved data URLs to matching Markdown images', () => {
    const html = ['<img src="./assets/screen.png">', '<img src="./assets/other.png">', '<img src="https://example.test/remote.png">'].join('');
    const rewritten = applyMarkdownPreviewImageDataUrls(html, {
      './assets/screen.png': 'data:image/png;base64,AAAA',
    });
    const body = parseBody(rewritten);
    const images = Array.from(body.querySelectorAll('img'));

    expect(images[0].getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(images[0].getAttribute('loading')).toBe('lazy');
    expect(images[1].getAttribute('src')).toBe('./assets/other.png');
    expect(images[1].getAttribute('loading')).toBeNull();
    expect(images[2].getAttribute('src')).toBe('https://example.test/remote.png');
  });

  it('leaves Markdown image HTML unchanged when DOMParser is unavailable', () => {
    vi.stubGlobal('DOMParser', undefined);
    const html = '<img src="./assets/screen.png">';

    expect(
      applyMarkdownPreviewImageDataUrls(html, {
        './assets/screen.png': 'data:image/png;base64,AAAA',
      }),
    ).toBe(html);
  });
});
