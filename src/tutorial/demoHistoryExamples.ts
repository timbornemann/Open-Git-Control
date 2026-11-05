import type { HistoryExample } from '@/shared/tutorial/types';
import examples from './fixtures/history-readme.json';

export const historyText = (version: HistoryExample, language: 'de' | 'en') => examples[version][language === 'de' ? 0 : 1];
