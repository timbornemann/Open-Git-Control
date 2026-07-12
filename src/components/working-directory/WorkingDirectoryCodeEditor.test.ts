import { describe, expect, it } from 'vitest';
import { detectLineSeparator, getLanguageLabelForPath } from './WorkingDirectoryCodeEditor';

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

describe('detectLineSeparator', () => {
  it('keeps CRLF files on CRLF so they round-trip without a spurious dirty flag', () => {
    expect(detectLineSeparator('line one\r\nline two\r\n')).toBe('\r\n');
  });

  it('uses LF for LF-only and separator-free content', () => {
    expect(detectLineSeparator('line one\nline two')).toBe('\n');
    expect(detectLineSeparator('single line')).toBe('\n');
    expect(detectLineSeparator('')).toBe('\n');
  });

  it('detects a lone CR (classic Mac) separator', () => {
    expect(detectLineSeparator('line one\rline two')).toBe('\r');
  });
});
