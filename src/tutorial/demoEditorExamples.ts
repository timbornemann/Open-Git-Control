import type { EditorExample, TutorialText } from '@/shared/tutorial/types';
import examples from './fixtures/editor-readme.json';
const pair = (key: EditorExample): TutorialText => {
  const value = examples[key];
  if (value.length !== 2) throw new Error('Practice file text requires German and English.');
  return [value[0], value[1]];
};
export const EDITOR_CONTENT = {
  head: pair('head'),
  edited: pair('edited'),
  draft: pair('draft'),
  index: pair('index'),
  work: pair('work'),
  'index-edited': pair('index-edited'),
} satisfies Record<EditorExample, TutorialText>;
