import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStructuredDiffContext, parseStatusPorcelain } from '../AiService';

describe('AiService porcelain path parsing', () => {
  it('unquotes file paths with spaces', () => {
    const entries = parseStatusPorcelain('?? "Docs/App Overview.png"\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('Docs/App Overview.png');
    expect(entries[0].code).toBe('??');
  });

  it('keeps the destination path for rename entries', () => {
    const entries = parseStatusPorcelain('R  "Docs/Old Name.png" -> "Docs/App Overview.png"\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('Docs/App Overview.png');
    expect(entries[0].originalPath).toBe('Docs/Old Name.png');
    expect(entries[0].code).toBe('R ');
  });

  it('parses NUL-delimited rename/copy records and preserves significant whitespace', () => {
    const entries = parseStatusPorcelain('R  new -> name.txt\0 old name.txt\0??  leading and trailing  \0C  copy.txt\0source.txt\0');

    expect(entries).toEqual([
      { path: 'new -> name.txt', originalPath: ' old name.txt', x: 'R', y: ' ', code: 'R ' },
      { path: ' leading and trailing  ', x: '?', y: '?', code: '??' },
      { path: 'copy.txt', originalPath: 'source.txt', x: 'C', y: ' ', code: 'C ' },
    ]);
  });

  it('does not interpret an arrow in an ordinary filename as rename syntax', () => {
    expect(parseStatusPorcelain('?? foo -> bar.txt\n')[0].path).toBe('foo -> bar.txt');
  });

  it('decodes escaped quotes from porcelain output', () => {
    const entries = parseStatusPorcelain('?? "Docs/App \\\"Overview\\\".png"\n');
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('Docs/App "Overview".png');
  });
});

describe('AiService context extraction and prompts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('includes representative changes from first, middle, and last hunks', () => {
    const diff = [
      'diff --git a/src/app.ts b/src/app.ts',
      'index 1111111..2222222 100644',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,4 +1,4 @@',
      '-const oldFlag = true;',
      '+const oldFlag = false;',
      '@@ -20,4 +20,6 @@',
      '-return loadProfile(userId);',
      '+const profile = await loadProfile(userId);',
      '+trackEvent("profile_loaded");',
      '@@ -80,2 +84,4 @@',
      '-export default App;',
      '+export { App };',
      '+export default App;',
      '',
    ].join('\n');

    const context = buildStructuredDiffContext(diff).join('\n');
    expect(context).toContain('oldFlag = false');
    expect(context).toContain('trackEvent("profile_loaded")');
    expect(context).toContain('export { App }');
  });
});
