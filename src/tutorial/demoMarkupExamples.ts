import type { MarkupExample } from '@/shared/tutorial/types';
import examples from './fixtures/markup-files.json';
export const markupText = (version: MarkupExample, language: 'de' | 'en') => examples[version][language === 'de' ? 0 : 1];
export const demoMarkupFiles = (language: 'de' | 'en') => ({
  'page.html': markupText('html-source', language),
  'project.xml': markupText('xml-source', language),
});
