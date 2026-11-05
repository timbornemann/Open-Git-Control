import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import type { TutorialLaunchContext } from '@/shared/tutorial/types';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { writeDemoFile, ignoreDemoRule } from './demoFiles';
import { demoBlob, demoBlobBytes, demoBlobText } from './demoBlob';
import { demoFileVersion } from './demoFileVersions';
import { searchText } from './demoSearchExamples';
const context: TutorialLaunchContext = {
  request: { chapterId: 'files-navigation' },
  language: 'en',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const setup = () => createDemoApi(context, { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'files-navigation')!.steps[0], scenario: 'search-files' });
const guide = 'guides/Planet.md';

describe('real search and replacement in the practice provider', () => {
  it('distinguishes ranked filenames from grouped text matches and honors case', async () => {
    const {
      api: { git },
    } = setup();
    const names = await git.searchWorkingDirectory({ query: 'planet', mode: 'filename' }, DEMO_REPO);
    expect(names).toMatchObject({ success: true, data: { totalMatches: 3, scannedFiles: 7, truncated: false } });
    if (!names.success) throw new Error(names.error);
    expect(names.data.files.map((file) => file.path)).toEqual([guide, 'notes/planet.txt', 'src/planet.ts']);
    expect(names.data.files.every((file) => file.matches.length === 0)).toBe(true);
    expect(await git.searchWorkingDirectory({ query: 'Planet', mode: 'filename', caseSensitive: true }, DEMO_REPO)).toMatchObject({
      success: true,
      data: { totalMatches: 1, files: [{ path: guide }] },
    });
    const contents = await git.searchWorkingDirectory({ query: 'planet', mode: 'content' }, DEMO_REPO);
    expect(contents).toMatchObject({ success: true, data: { totalMatches: 5, scannedFiles: 7 } });
    if (!contents.success) throw new Error(contents.error);
    expect(contents.data.files[0]).toMatchObject({
      path: guide,
      matches: [
        { line: 1, column: 3 },
        { line: 3, column: 1 },
        { line: 4, column: 1 },
      ],
    });
    expect(await git.searchWorkingDirectory({ query: 'planet', mode: 'content', caseSensitive: true }, DEMO_REPO)).toMatchObject({
      success: true,
      data: { totalMatches: 3 },
    });
    expect(await git.searchWorkingDirectory({ query: 'missing planet', mode: 'content' }, DEMO_REPO)).toMatchObject({
      success: true,
      data: { totalMatches: 0, files: [] },
    });
  });
  it('replaces the selected line only and rejects stale results without a partial write', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    const index = structuredClone(repo.indexFiles),
      version = demoFileVersion(repo, 'unstaged', guide);
    expect(await git.replaceWorkingDirectory({ query: 'planet', replacement: 'world', target: { path: guide, line: 3, column: 1 } }, DEMO_REPO)).toEqual({
      success: true,
      data: { replacements: 1, paths: [guide] },
    });
    expect(repo.files[guide]).toBe(searchText('guide-one', 'en'));
    expect([...repo.modified]).toEqual([guide]);
    expect(repo.indexFiles).toEqual(index);
    expect(demoFileVersion(repo, 'unstaged', guide)).not.toBe(version);
    const saved = structuredClone(repo.files);
    expect(await git.replaceWorkingDirectory({ query: 'planet', replacement: 'oops', target: { path: guide, line: 3, column: 1 } }, DEMO_REPO)).toMatchObject({
      success: false,
      error: expect.stringContaining('no longer available'),
    });
    expect(repo.files).toEqual(saved);
  });
  it('replaces all actual occurrences with one update, preserving filenames/HEAD/index', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    const index = structuredClone(repo.indexFiles),
      head = structuredClone(repo.headFiles);
    let updates = 0;
    const dispose = repo.subscribe(() => updates++);
    expect(await git.replaceWorkingDirectory({ query: 'planet', replacement: 'world', all: true }, DEMO_REPO)).toMatchObject({
      success: true,
      data: { replacements: 5, paths: [guide, 'notes/planet.txt', 'src/planet.ts'] },
    });
    dispose();
    expect(updates).toBe(1);
    expect(repo.files[guide]).toBe(searchText('guide-all', 'en'));
    expect(repo.files['notes/planet.txt']).toBe(searchText('notes-all', 'en'));
    expect(repo.files['src/planet.ts']).toBe(searchText('code-all', 'en'));
    expect(repo.indexFiles).toEqual(index);
    expect(repo.headFiles).toEqual(head);
    expect([...repo.staged]).toEqual([]);
    expect([...repo.untracked]).toEqual([]);
    expect([...repo.modified].sort()).toEqual([guide, 'notes/planet.txt', 'src/planet.ts']);
    expect(await git.searchWorkingDirectory({ query: 'planet', mode: 'content' }, DEMO_REPO)).toMatchObject({ success: true, data: { totalMatches: 0 } });
    expect(await git.searchWorkingDirectory({ query: 'planet', mode: 'filename' }, DEMO_REPO)).toMatchObject({ success: true, data: { totalMatches: 3 } });
    expect(setup().repo.status()).toBe('');
  });
  it('treats regex syntax/replacement dollars literally and preserves CRLF and Latin-1', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    writeDemoFile(repo, 'literal.txt', demoBlob('é [x]\r\n[x] = $&\r\n', 'latin1'));
    const result = await git.searchWorkingDirectory({ query: '[x]', mode: 'content' }, DEMO_REPO);
    expect(result).toMatchObject({ success: true, data: { totalMatches: 2 } });
    expect(result.success && result.data.files[0]).toMatchObject({
      path: 'literal.txt',
      matches: [
        { line: 1, column: 3 },
        { line: 2, column: 1 },
      ],
    });
    expect(await git.replaceWorkingDirectory({ query: '[x]', replacement: '$&', paths: ['literal.txt'] }, DEMO_REPO)).toMatchObject({
      success: true,
      data: { replacements: 2 },
    });
    expect(demoBlobText(repo.files['literal.txt'])).toBe('é $&\r\n$& = $&\r\n');
    expect(repo.files['literal.txt']).toMatchObject({ encoding: 'latin1' });
    expect(demoBlobBytes(repo.files['literal.txt'])[0]).toBe(233);
  });
  it('excludes ignored untracked files and binary contents while keeping tracked ignored paths', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    writeDemoFile(repo, 'private.tmp', 'planet\n');
    writeDemoFile(repo, 'binary.bin', '\0planet');
    ignoreDemoRule(repo, '*.tmp');
    ignoreDemoRule(repo, 'guides/');
    const result = await git.searchWorkingDirectory({ query: 'planet', mode: 'content' }, DEMO_REPO);
    expect(result).toMatchObject({ success: true, data: { totalMatches: 5 } });
    expect((result.success ? result.data.files : []).some((file) => file.path === 'private.tmp' || file.path === 'binary.bin')).toBe(false);
    await git.replaceWorkingDirectory({ query: 'planet', replacement: 'world', all: true }, DEMO_REPO);
    expect(repo.files['private.tmp']).toBe('planet\n');
    expect(repo.files['binary.bin']).toBe('\0planet');
    expect(repo.files[guide]).toBe(searchText('guide-all', 'en'));
  });
  it('validates every explicit target and encoding before changing any saved file', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    writeDemoFile(repo, 'z-latin1.txt', demoBlob('é planet', 'latin1'));
    const before = structuredClone(repo.files);
    expect(await git.replaceWorkingDirectory({ query: 'planet', replacement: '世界', paths: [guide, 'z-latin1.txt'] }, DEMO_REPO)).toMatchObject({
      success: false,
    });
    expect(repo.files).toEqual(before);
    expect(await git.replaceWorkingDirectory({ query: 'planet', replacement: 'world', paths: [guide, '../outside'] }, DEMO_REPO)).toMatchObject({
      success: false,
    });
    expect(repo.files).toEqual(before);
    expect(await git.replaceWorkingDirectory({ query: 'planet', replacement: 'world', all: true }, DEMO_SECOND_REPO)).toMatchObject({ success: false });
    expect(await git.searchWorkingDirectory({ query: 'planet', mode: 'content' }, DEMO_SECOND_REPO)).toMatchObject({ success: false });
    expect(repo.files).toEqual(before);
  });
  it('reports display truncation while Replace all processes every match', async () => {
    const {
      api: { git },
      repo,
    } = setup();
    writeDemoFile(repo, 'many.txt', 'token\n'.repeat(210));
    const result = await git.searchWorkingDirectory({ query: 'token', mode: 'content' }, DEMO_REPO);
    expect(result).toMatchObject({ success: true, data: { totalMatches: 210, truncated: true } });
    expect(result.success && result.data.files[0].matches).toHaveLength(200);
    expect(await git.replaceWorkingDirectory({ query: 'token', replacement: 'done', all: true }, DEMO_REPO)).toMatchObject({
      success: true,
      data: { replacements: 210, paths: ['many.txt'] },
    });
    expect(repo.files['many.txt']).toBe('done\n'.repeat(210));
  });
  it.each(['', 'line\nbreak', '\0', 'x'.repeat(1_001)])('rejects invalid query %j without a mutation', async (query) => {
    const {
      api: { git },
      repo,
    } = setup();
    const before = structuredClone(repo.files);
    expect(await git.searchWorkingDirectory({ query, mode: 'content' }, DEMO_REPO)).toMatchObject({ success: false });
    expect(await git.replaceWorkingDirectory({ query, replacement: 'world', all: true }, DEMO_REPO)).toMatchObject({ success: false });
    expect(repo.files).toEqual(before);
  });
});
