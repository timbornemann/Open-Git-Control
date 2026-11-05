import type { FormatExample } from '@/shared/tutorial/types';
import { tutorialText } from '@/shared/tutorial/types';
import examples from './fixtures/file-formats.json';

export const formatText = (version: FormatExample, language: 'de' | 'en') => {
  const pair = examples[version];
  if (pair.length !== 2) throw new Error('Practice file formats require German and English.');
  return tutorialText([pair[0], pair[1]], language);
};
export const demoFormatFiles = (language: 'de' | 'en') => ({
  'docs/guide.md': formatText('markdown', language),
  'site/index.html': formatText('html', language),
  'site/style.css': formatText('stylesheet', language),
  'data/tasks.csv': formatText('csv', language),
});
