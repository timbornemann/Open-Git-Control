import { describe, expect, it } from 'vitest';
import {
  formatCommitMessageStyleExample,
  getCommitMessageLanguageLabel,
  getCommitMessageLanguageOptions,
  getCommitMessageStyleExample,
  getCommitMessageStyleLabel,
  getCommitMessageStyleOptions,
} from '@/utils/commitMessagePreferences';
import { translateFromCatalog, type CatalogTranslateFn } from '@/i18n';

const de: CatalogTranslateFn = (key, variables) => translateFromCatalog('de', key, variables);
const en: CatalogTranslateFn = (key, variables) => translateFromCatalog('en', key, variables);

describe('commitMessagePreferences', () => {
  it('returns localized style labels with a conventional fallback', () => {
    expect(getCommitMessageStyleLabel('plain', de)).toBe('Plain');
    expect(getCommitMessageStyleLabel('detailed', en)).toBe('Detailed');
    expect(getCommitMessageStyleLabel('conventional', en)).toBe('Conventional Commits');
    expect(getCommitMessageStyleLabel('unknown' as never, de)).toBe('Conventional Commits');
  });

  it('returns localized language labels with an auto fallback', () => {
    expect(getCommitMessageLanguageLabel('de', en)).toBe('German');
    expect(getCommitMessageLanguageLabel('en', de)).toBe('Englisch');
    expect(getCommitMessageLanguageLabel('auto', en)).toBe('Auto from notes');
    expect(getCommitMessageLanguageLabel('unknown' as never, de)).toBe('Automatisch aus Notizen');
  });

  it('builds ordered style and language option lists', () => {
    expect(getCommitMessageLanguageOptions(en)).toEqual([
      { value: 'auto', label: 'Auto from notes' },
      { value: 'de', label: 'German' },
      { value: 'en', label: 'English' },
    ]);

    expect(getCommitMessageStyleOptions(en)).toEqual([
      { value: 'conventional', label: 'Conventional Commits' },
      { value: 'plain', label: 'Plain' },
      { value: 'detailed', label: 'Detailed' },
    ]);
  });

  it('returns examples for every style in german and english', () => {
    expect(getCommitMessageStyleExample('plain', 'de', de).title).toBe('verbessere Clone-Fortschritt');
    expect(getCommitMessageStyleExample('plain', 'en', en).title).toBe('improve clone progress');
    expect(getCommitMessageStyleExample('detailed', 'de', de).description).toContain('Resolving');
    expect(getCommitMessageStyleExample('detailed', 'en', en).description).toContain('separate loading states');
    expect(getCommitMessageStyleExample('conventional', 'de', de).title).toBe('feat(git): zeige Transfer-Fortschritt');
    expect(getCommitMessageStyleExample('conventional', 'en', en).title).toBe('feat(git): show transfer progress phases');
  });

  it('formats examples with or without descriptions', () => {
    expect(formatCommitMessageStyleExample('detailed', 'en', en)).toContain('\n\nShows Receiving');

    const withoutDescription = formatCommitMessageStyleExample('plain', 'en', (key, variables) =>
      key === 'commitMessage.examples.plainDescriptionHint' ? '' : translateFromCatalog('en', key, variables),
    );
    expect(withoutDescription).toBe('improve clone progress');
  });
});
