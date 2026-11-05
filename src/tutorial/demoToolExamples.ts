import type { ToolExample, TutorialStep } from '@/shared/tutorial/types';
import examples from './fixtures/editor-tools.json';
import textExamples from './fixtures/text-tools.json';
const allExamples = { ...examples, ...textExamples };
export const toolsText = (version: ToolExample, language: 'de' | 'en') => allExamples[version][language === 'de' ? 0 : 1];
export function toolScenarioText(scenario: TutorialStep['scenario'], language: 'de' | 'en') {
  switch (scenario) {
    case 'encoding':
      return toolsText('encoding', language);
    case 'text-tools':
      return toolsText('lines', language);
    case 'affixes':
      return toolsText('affix-base', language);
    case 'codecs':
      return toolsText('codec-base', language);
    case 'selection-codecs':
      return toolsText('selection-base', language);
    case 'hashes':
      return toolsText('hash-base', language);
    default:
      return undefined;
  }
}
