import { describe, expect, it } from 'vitest';
import {
  isMarkdownFilePath,
  resolveMarkdownPreviewAssetPath,
} from '../markdownPreview';

describe('markdown preview helpers', () => {
  it('detects common Markdown extensions', () => {
    expect(isMarkdownFilePath('README.md')).toBe(true);
    expect(isMarkdownFilePath('docs/guide.markdown')).toBe(true);
    expect(isMarkdownFilePath('notes.txt')).toBe(false);
  });

  it('resolves relative image paths next to the Markdown file', () => {
    expect(resolveMarkdownPreviewAssetPath('docs/guide/readme.md', './images/logo.png')).toBe('docs/guide/images/logo.png');
    expect(resolveMarkdownPreviewAssetPath('docs/guide/readme.md', '../shared/logo.png')).toBe('docs/shared/logo.png');
  });

  it('resolves repo-root image paths and encoded filenames', () => {
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '/assets/App%20Overview.png')).toBe('assets/App Overview.png');
  });

  it('rejects external and outside-repository image paths', () => {
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', 'https://example.test/a.png')).toBeNull();
    expect(resolveMarkdownPreviewAssetPath('docs/readme.md', '../../secret.png')).toBeNull();
  });
});
