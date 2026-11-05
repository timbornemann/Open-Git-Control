import { describe, expect, it } from 'vitest';
import {
  addToLines,
  encodeBase64,
  decodeBase64,
  encodeUrlComponent,
  decodeUrlComponent,
  replaceTextSelection,
} from '@/components/working-directory/textContentTransforms';
import { compactTextToSingleLine } from '@/components/working-directory/fileContentTransforms';
import { toolsText } from './demoToolExamples';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext, ToolExample } from '@/shared/tutorial/types';
import { demoBlobText } from './demoBlob';

describe.each(['de', 'en'] as const)('text lesson examples in %s', (language) => {
  const text = (version: ToolExample) => toolsText(version, language);
  it('matches the real prefix/suffix and compaction results including line endings', () => {
    const affixed = addToLines(text('affix-base'), '> ', ' !');
    expect(affixed).toBe(text('affixed'));
    expect(compactTextToSingleLine(affixed)).toBe(text('compacted'));
  });
  it('round-trips complete UTF-8 documents through both codecs', () => {
    expect(encodeBase64(text('codec-base'))).toBe(text('codec-base64'));
    expect(decodeBase64(text('codec-base64'))).toBe(text('codec-base'));
    expect(encodeUrlComponent(text('codec-base'))).toBe(text('codec-url'));
    expect(decodeUrlComponent(text('codec-url'))).toBe(text('codec-base'));
    expect(() => decodeBase64(text('invalid-base64'))).toThrow('Invalid Base64');
    expect(() => decodeBase64('/w==')).toThrow('UTF-8');
    expect(() => decodeUrlComponent(text('invalid-url'))).toThrow('Invalid URL');
  });
  it('preserves surrounding text for all four selection operations', () => {
    const base = text('selection-base');
    expect(base.slice(7, 11)).toBe('Café');
    const base64 = replaceTextSelection(base, { from: 7, to: 11 }, encodeBase64(base.slice(7, 11)));
    expect(base64).toBe(text('selection-base64'));
    expect(replaceTextSelection(base64, { from: 7, to: 15 }, decodeBase64(base64.slice(7, 15)))).toBe(base);
    const url = replaceTextSelection(base, { from: 7, to: 11 }, encodeUrlComponent(base.slice(7, 11)));
    expect(url).toBe(text('selection-url'));
    expect(replaceTextSelection(url, { from: 7, to: 16 }, decodeUrlComponent(url.slice(7, 16)))).toBe(base);
  });
  it('starts each new lesson with a clean tracked file and its matching index', () => {
    for (const [chapterId, version] of [
      ['text-affixes', 'affix-base'],
      ['codecs-document', 'codec-base'],
      ['codecs-selection', 'selection-base'],
    ] as const) {
      const context: TutorialLaunchContext = {
        request: { chapterId },
        language,
        theme: 'copper-night',
        progress: { version: 1, welcomeSeen: true, completedChapters: [] },
      };
      const { repo } = createDemoApi(context, TUTORIAL_CHAPTERS.find((chapter) => chapter.id === chapterId)!.steps[0]);
      expect(repo.status()).toBe('');
      expect(demoBlobText(repo.files['README.md'])).toBe(text(version));
      expect(demoBlobText(repo.indexFiles['README.md'])).toBe(text(version));
    }
  });
});
