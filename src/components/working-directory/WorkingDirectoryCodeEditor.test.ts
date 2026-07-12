import { describe, expect, it } from 'vitest';
import { getLanguageLabelForPath } from './WorkingDirectoryCodeEditor';

describe('WorkingDirectoryCodeEditor language selection', () => {
  it('selects a language based on the file name', () => {
    expect(getLanguageLabelForPath('src/App.tsx')).toBe('JavaScript / TypeScript');
    expect(getLanguageLabelForPath('site/index.html')).toBe('HTML');
    expect(getLanguageLabelForPath('styles/theme.css')).toBe('CSS');
    expect(getLanguageLabelForPath('config/settings.json')).toBe('JSON');
  });

  it('uses plain text when no language is known', () => {
    expect(getLanguageLabelForPath('notes/example.unknown-extension')).toBeNull();
  });
});
