// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdownToSanitizedHtml } from '../markdownPreview';
import { resolveUserNoteImagePath } from '@/shared/userNotes';

describe('notice Markdown asset isolation', () => {
  it('removes all fetch-capable foreign content while retaining standard Markdown', () => {
    const html = renderMarkdownToSanitizedHtml(
      '# Info\n\n- [x] Saved\n\n```js\nconst ready = true;\n```\n<img src="https://evil.invalid/tracker" srcset="https://evil.invalid/two 2x">\n<picture><source srcset="https://evil.invalid/three"><img src="image.gif"></picture>\n<svg><image href="https://evil.invalid/four" /></svg>\n<audio src="https://evil.invalid/audio"></audio>\n<video poster="https://evil.invalid/poster"></video>\n<script>alert(1)</script>',
      { dataUrls: { 'image.gif': 'data:image/gif;base64,R0lGODlh' }, missingLabel: 'Image unavailable' },
    );
    const body = new DOMParser().parseFromString(html, 'text/html').body;
    expect(body.querySelector('h1')?.textContent).toBe('Info');
    expect(body.querySelector('code')?.textContent).toContain('const ready');
    expect(body.querySelector('input')?.disabled).toBe(true);
    expect(body.querySelector('img[src^="http"], [srcset], video, audio, svg, iframe, script, source')).toBeNull();
    expect(body.querySelector('img[title="Image unavailable"]')).not.toBeNull();
  });
  it('does not trust data URLs in the source or forged image-cache entries', () => {
    const html = renderMarkdownToSanitizedHtml('![Inline](data:image/svg+xml,attack)\n![Forged](forged.png)', {
      dataUrls: { 'forged.png': 'https://evil.invalid/image' },
      missingLabel: 'Missing',
    });
    expect(new DOMParser().parseFromString(html, 'text/html').querySelector('img[src]')).toBeNull();
  });
  it.each(['../private.png', '%2e%2e/private.png', '/outside.png', 'https://evil.invalid/a.png', '//evil.invalid/a.png', '..\\private.png'])(
    'rejects image reference %s',
    (reference) => {
      expect(resolveUserNoteImagePath(reference)).toBeNull();
    },
  );
  it('supports nested and repository-root image references inside the notice folder', () => {
    expect(resolveUserNoteImagePath('assets/status%20image.gif?raw=1')).toBe('.Open-Git-Control/notes-to-user/assets/status image.gif');
    expect(resolveUserNoteImagePath('/.Open-Git-Control/notes-to-user/assets/status.gif')).toBe('.Open-Git-Control/notes-to-user/assets/status.gif');
  });
});
