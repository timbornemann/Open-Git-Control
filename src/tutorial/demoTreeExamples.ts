import type { TreeExample } from '@/shared/tutorial/types';
import examples from './fixtures/tree-files.json';
export const treeText = (version: TreeExample, language: 'de' | 'en') => examples[version][language === 'de' ? 0 : 1];
export const demoTreeFiles = (language: 'de' | 'en') => ({
  'practice/note.md': treeText('note', language),
  'practice/other.md': treeText('other', language),
  'archive/keep.txt': treeText('keep', language),
  'variant/note.md': treeText('other', language),
});
