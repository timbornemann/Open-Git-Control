import { tutorialText, type TutorialFileContent } from '@/shared/tutorial/types';
import { HUNK_CONTENT } from './demoHunkExamples';
import { EDITOR_CONTENT } from './demoEditorExamples';
import { formatText } from './demoFormatExamples';
import { toolsText } from './demoToolExamples';
import { exampleHash } from './demoHashExamples';
import { structuredText } from './demoStructuredExamples';
import { markupText } from './demoMarkupExamples';
import { treeText } from './demoTreeExamples';
import { searchText } from './demoSearchExamples';
import { historyText } from './demoHistoryExamples';
import { mergeConflictText } from './demoMergeExamples';

export function resolveTutorialFileContent(content: TutorialFileContent, language: 'de' | 'en'): string {
  if (!('example' in content)) return tutorialText(content, language);
  switch (content.example) {
    case 'readme-hunks':
      return HUNK_CONTENT[content.version];
    case 'editor-readme':
      return tutorialText(EDITOR_CONTENT[content.version], language);
    case 'file-formats':
      return formatText(content.version, language);
    case 'editor-tools':
      return toolsText(content.version, language);
    case 'file-hash':
      return exampleHash(content.version, content.algorithm);
    case 'structured-files':
      return structuredText(content.version, language);
    case 'markup-files':
      return markupText(content.version, language);
    case 'tree-files':
      return treeText(content.version, language);
    case 'search-files':
      return searchText(content.version, language);
    case 'history-readme':
      return historyText(content.version, language);
    case 'merge-conflicts':
      return mergeConflictText(content.version, language);
  }
}
