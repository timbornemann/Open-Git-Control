import type { MergeConflictExample } from '@/shared/tutorial/types';
import examples from './fixtures/merge-conflicts.json';

export const mergeConflictText = (version: MergeConflictExample, language: 'de' | 'en') => examples[version][language === 'de' ? 0 : 1];
