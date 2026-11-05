import type { StructuredExample } from '@/shared/tutorial/types';
import examples from './fixtures/structured-files.json';
export const structuredText = (version: StructuredExample, language: 'de' | 'en') => examples[version][language === 'de' ? 0 : 1];
export const demoStructuredFiles = (language: 'de' | 'en') => ({
  'config.json': structuredText('base', language),
  'config.yaml': structuredText('yaml-base', language),
});
