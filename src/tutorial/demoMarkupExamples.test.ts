// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatHtmlText, minifyHtmlText, formatXmlText, minifyXmlText } from '@/components/working-directory/structuredContentTransforms';
import { markupText } from './demoMarkupExamples';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
const comments = (document: Document) => {
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  let count = 0;
  while (walker.nextNode()) count++;
  return count;
};
describe.each(['de', 'en'] as const)('markup examples in %s', (language) => {
  it('matches real HTML formatting/minification and the different comment behavior', async () => {
    const formatted = await formatHtmlText(markupText('html-source', language));
    expect(formatted).toBe(markupText('html-formatted', language));
    expect(await minifyHtmlText(formatted)).toBe(markupText('html-minified', language));
    for (const version of ['html-source', 'html-formatted', 'html-minified'] as const) {
      const document = new DOMParser().parseFromString(markupText(version, language), 'text/html');
      expect(document.title).toBe('OGC');
      expect(document.querySelector('h1')?.textContent).toBe('OGC');
      expect(document.querySelector('p')?.textContent).toBe('Hello world & team.');
      expect(document.querySelector('pre')?.textContent).toBe('line 1\n  line 2');
      expect(document.querySelector('main')?.getAttribute('class')).toBe('card');
      expect(comments(document)).toBe(version === 'html-minified' ? 0 : 1);
    }
  });
  it('preserves XML attributes, entities, CDATA and comments through both real tools', async () => {
    const formatted = await formatXmlText(markupText('xml-source', language));
    expect(formatted).toBe(markupText('xml-formatted', language));
    expect(await minifyXmlText(formatted)).toBe(markupText('xml-source', language));
    for (const source of [markupText('xml-source', language), formatted, await minifyXmlText(formatted)]) {
      const document = new DOMParser().parseFromString(source, 'application/xml');
      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.documentElement.getAttribute('name')).toBe('OGC');
      expect(document.querySelector('item')?.textContent).toBe('Café & tea');
      expect(document.querySelector('item')?.getAttribute('id')).toBe('1');
      expect(document.querySelector('script')?.textContent).toBe('a < b && c > d');
      expect(document.querySelector('script')?.firstChild?.nodeType).toBe(Node.CDATA_SECTION_NODE);
      expect(document.querySelector('empty')?.childNodes.length).toBe(0);
      expect(comments(document)).toBe(1);
      expect(source.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    }
  });
  it('rejects both incomplete HTML and mismatched XML with the lesson feedback', async () => {
    await expect(formatHtmlText(markupText('html-invalid', language))).rejects.toThrow('Unexpected character');
    await expect(minifyHtmlText(markupText('html-invalid', language))).rejects.toThrow('Parse Error:');
    await expect(formatXmlText(markupText('xml-invalid', language))).rejects.toThrow('Failed to parse XML');
    await expect(minifyXmlText(markupText('xml-invalid', language))).rejects.toThrow('Failed to parse XML');
  });
  it.each(['markup-html', 'markup-xml'])('starts %s clean and keeps saved/index bytes separate from invalid drafts', (id) => {
    const context: TutorialLaunchContext = {
      request: { chapterId: id },
      language,
      theme: 'copper-night',
      progress: { version: 1, welcomeSeen: true, completedChapters: [] },
    };
    const chapter = TUTORIAL_CHAPTERS.find((entry) => entry.id === id)!;
    const kind = id === 'markup-html' ? 'html' : 'xml';
    const path = kind === 'html' ? 'page.html' : 'project.xml';
    const source = markupText(kind === 'html' ? 'html-source' : 'xml-source', language);
    const saved = markupText(kind === 'html' ? 'html-minified' : 'xml-source', language);
    const clean = createDemoApi(context, chapter.steps[0]);
    expect(clean.repo.status()).toBe('');
    expect(clean.repo.files[path]).toBe(source);
    expect(clean.repo.headFiles[path]).toBe(source);
    const replay = createDemoApi(
      context,
      chapter.steps.find((step) => step.id === 'minify-error')!,
    );
    expect(replay.repo.files[path]).toBe(saved);
    expect(replay.repo.indexFiles[path]).toBe(source);
    expect(replay.repo.headFiles[path]).toBe(source);
    expect(replay.repo.staged.size).toBe(0);
    expect(replay.repo.untracked.size).toBe(0);
    expect([...replay.repo.modified]).toEqual(kind === 'html' ? [path] : []);
  });
});
