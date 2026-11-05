import type { SearchExample } from '@/shared/tutorial/types';
import examples from './fixtures/search-files.json';
export const searchText = (version: SearchExample, language: 'de' | 'en') => examples[version][language === 'de' ? 0 : 1];
export const demoSearchFiles = (language: 'de' | 'en') => ({
  'guides/Planet.md': searchText('guide', language),
  'notes/planet.txt': searchText('notes', language),
  'src/planet.ts': searchText('code', language),
});
