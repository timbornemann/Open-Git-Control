import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseDiff, buildHunkPatch } from '@/shared/diff/parser';
import { diffSelectionUnits } from '@/shared/diff/lineSelection';
import { HUNK_CONTENT } from './demoHunkExamples';
import type { TutorialLaunchContext, TutorialStep } from '@/shared/tutorial/types';
import { createDemoApi } from './demoApi';
import { DEMO_REPO, DEMO_SECOND_REPO } from './demoRepository';
import { demoTextDiff } from './demoDiff';

const context: TutorialLaunchContext = {
  request: { chapterId: 'diff-hunks' },
  language: 'de',
  theme: 'copper-night',
  progress: { version: 1, welcomeSeen: true, completedChapters: [] },
};
const create = () =>
  createDemoApi(context, { id: 'hunks', title: ['', ''], description: ['', ''], target: 'body', area: 'repo', scenario: 'hunks' } satisfies TutorialStep);
const hunk = (text: string, index = 0) => {
  const parsed = parseDiff(text);
  return buildHunkPatch(parsed.fileHeader, parsed.hunks[index]);
};

describe('private practice patches', () => {
  it('shows two independent hunks with three replacements in the first', () => {
    const { repo } = create();
    const parsed = parseDiff(repo.diff());
    expect(parsed.hunks).toHaveLength(2);
    expect(diffSelectionUnits(parsed).map((unit) => unit.hunkId)).toEqual(['hunk-1', 'hunk-1', 'hunk-1', 'hunk-2']);
  });
  it('stages and unstages one hunk without changing the working file or other changes', async () => {
    const { repo, api } = create();
    expect((await api.git.applyPatch(hunk(repo.diff()), { cached: true }, DEMO_REPO)).success).toBe(true);
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.first);
    expect(repo.files['README.md']).toBe(HUNK_CONTENT.all);
    expect(repo.status()).toContain('MM README.md');
    expect(await api.git.getWorkingTreeStats('demo-' + repo.revision)).toMatchObject({
      success: true,
      data: {
        staged: { files: 1, additions: 3, deletions: 3 },
        unstaged: { files: 1, additions: 1, deletions: 1 },
      },
    });
    expect((await api.git.applyPatch(hunk(repo.diff('README.md', true)), { cached: true, reverse: true }, DEMO_REPO)).success).toBe(true);
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.head);
    expect(repo.files['README.md']).toBe(HUNK_CONTENT.all);
    expect(repo.staged.size).toBe(0);
  });
  it('applies both hunks independently and reverses only the selected worktree hunk', async () => {
    const { repo, api } = create();
    const diff = repo.diff();
    await api.git.applyPatch(hunk(diff), { cached: true });
    expect((await api.git.applyPatch(hunk(diff, 1), { cached: true })).success).toBe(true);
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.all);
    await api.git.runGitCommand('reset', 'HEAD', '--', 'README.md');
    expect((await api.git.applyPatch(hunk(repo.diff()), { reverse: true })).success).toBe(true);
    expect(repo.files['README.md']).toBe(HUNK_CONTENT.last);
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.head);
  });
  it('selects one replacement pair while preserving the other two replacements and distant hunk', async () => {
    const { repo, api } = create();
    const expectedDiff = repo.diff();
    const id = diffSelectionUnits(parseDiff(expectedDiff))[0].id;
    expect(await api.git.applyDiffLineSelection({ repoPath: DEMO_REPO, path: 'README.md', source: 'unstaged', expectedDiff, selectedUnitIds: [id] })).toEqual({
      success: true,
      data: { status: 'applied' },
    });
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.greeting);
    expect(repo.files['README.md']).toBe(HUNK_CONTENT.all);
    expect(diffSelectionUnits(parseDiff(repo.diff()))).toHaveLength(3);
  });
  it('unstages one pair from a fully staged file without restoring its worktree', async () => {
    const { repo, api } = create();
    await api.git.stagePaths(['README.md']);
    const expectedDiff = repo.diff('README.md', true);
    const selectedUnitIds = [diffSelectionUnits(parseDiff(expectedDiff))[3].id];
    expect((await api.git.applyDiffLineSelection({ repoPath: DEMO_REPO, path: 'README.md', source: 'staged', expectedDiff, selectedUnitIds })).success).toBe(
      true,
    );
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.first);
    expect(repo.files['README.md']).toBe(HUNK_CONTENT.all);
  });
  it('rejects stale diffs, wrong repositories and invalid units without changing any file', async () => {
    const { repo, api } = create();
    const expectedDiff = repo.diff();
    const request = {
      repoPath: DEMO_REPO,
      path: 'README.md',
      source: 'unstaged' as const,
      expectedDiff,
      selectedUnitIds: [diffSelectionUnits(parseDiff(expectedDiff))[0].id],
    };
    const revision = repo.revision;
    expect(await api.git.applyDiffLineSelection({ ...request, expectedDiff: expectedDiff + '\n' })).toEqual({ success: true, data: { status: 'stale' } });
    expect((await api.git.applyDiffLineSelection({ ...request, repoPath: DEMO_SECOND_REPO })).success).toBe(false);
    expect((await api.git.applyDiffLineSelection({ ...request, selectedUnitIds: ['missing'] })).success).toBe(false);
    expect((await api.git.applyDiffLineSelection({ ...request, selectedUnitIds: [...request.selectedUnitIds, ...request.selectedUnitIds] })).success).toBe(
      false,
    );
    expect(repo.revision).toBe(revision);
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.head);
    expect(repo.files['README.md']).toBe(HUNK_CONTENT.all);
  });
  it('validates every file and hunk before making an atomic multi-file change', async () => {
    const { repo, api } = create();
    const invalid = demoTextDiff('missing.txt', 'old\n', 'new\n');
    const revision = repo.revision;
    expect((await api.git.applyPatch(hunk(repo.diff()) + invalid, { cached: true })).success).toBe(false);
    expect(repo.indexFiles['README.md']).toBe(HUNK_CONTENT.head);
    expect(repo.revision).toBe(revision);
    expect((await api.git.applyPatch(hunk(repo.diff()), { cached: true }, DEMO_SECOND_REPO)).success).toBe(false);
  });
  it('requires the adjacent newline replacement before staging a line appended to an unterminated file', async () => {
    const { repo, api } = create();
    await api.git.writeRepoFile('newline.txt', 'last');
    await api.git.stagePaths(['newline.txt']);
    await api.git.writeRepoFile('newline.txt', 'last\nadded\n');
    const expectedDiff = repo.diff('newline.txt');
    const ids = diffSelectionUnits(parseDiff(expectedDiff)).map((unit) => unit.id);
    const request = { repoPath: DEMO_REPO, path: 'newline.txt', source: 'unstaged' as const, expectedDiff, selectedUnitIds: ids.slice(1) };
    expect(await api.git.applyDiffLineSelection(request)).toEqual({ success: true, data: { status: 'unsupported', reason: 'lineEndingDependency' } });
    expect(repo.indexFiles['newline.txt']).toBe('last');
    expect(await api.git.applyDiffLineSelection({ ...request, selectedUnitIds: ids })).toEqual({ success: true, data: { status: 'applied' } });
    expect(repo.indexFiles['newline.txt']).toBe('last\nadded\n');
  });
  it('reports binary and unchanged files without pretending to stage a selection', async () => {
    const { repo, api } = create();
    const request = { repoPath: DEMO_REPO, path: 'binary.bin', source: 'unstaged' as const, expectedDiff: '', selectedUnitIds: ['hunk-1:0'] };
    await api.git.writeRepoFile('binary.bin', '\0old');
    await api.git.stagePaths(['binary.bin']);
    await api.git.writeRepoFile('binary.bin', '\0new');
    expect(await api.git.applyDiffLineSelection({ ...request, expectedDiff: repo.diff('binary.bin') })).toEqual({
      success: true,
      data: { status: 'unsupported', reason: 'binary' },
    });
    expect(repo.indexFiles['binary.bin']).toBe('\0old');
    expect(await api.git.applyDiffLineSelection({ ...request, path: 'LICENSE' })).toEqual({
      success: true,
      data: { status: 'unsupported', reason: 'noChanges' },
    });
  });
  it('refuses conflict files and patches whose displayed context no longer matches', async () => {
    const { repo, api } = create();
    const patch = hunk(repo.diff());
    await api.git.writeRepoFile('README.md', 'Different file\n');
    expect((await api.git.applyPatch(patch, { reverse: true })).success).toBe(false);
    expect(repo.files['README.md']).toBe('Different file\n');
    repo.conflicted = true;
    expect(
      await api.git.applyDiffLineSelection({ repoPath: DEMO_REPO, path: 'README.md', source: 'unstaged', expectedDiff: repo.diff(), selectedUnitIds: [] }),
    ).toEqual({ success: true, data: { status: 'unsupported', reason: 'conflict' } });
  });
  it('removes a new index entry when its complete new-file selection is unstaged', async () => {
    const { repo, api } = create();
    await api.git.writeRepoFile('new.txt', 'one\ntwo\n');
    await api.git.stagePaths(['new.txt']);
    const expectedDiff = repo.diff('new.txt', true);
    const selectedUnitIds = diffSelectionUnits(parseDiff(expectedDiff)).map((unit) => unit.id);
    expect(await api.git.applyDiffLineSelection({ repoPath: DEMO_REPO, path: 'new.txt', source: 'staged', expectedDiff, selectedUnitIds })).toEqual({
      success: true,
      data: { status: 'applied' },
    });
    expect(Object.hasOwnProperty.call(repo.indexFiles, 'new.txt')).toBe(false);
    expect(repo.files['new.txt']).toBe('one\ntwo\n');
    expect(repo.untracked.has('new.txt')).toBe(true);
  });
  it.each([
    ['empty insertion', '', 'one\n'],
    ['missing final newline', 'one', 'two'],
    ['add final newline', 'one', 'one\n'],
    ['remove final newline', 'one\n', 'one'],
    ['CRLF', 'one\r\ntwo\r\n', 'ONE\r\ntwo\r\n'],
    ['duplicate context', 'same\nsame\nlast', 'same\nSAME\nlast'],
    [
      'separate insertion and deletion',
      HUNK_CONTENT.head,
      HUNK_CONTENT.head.replace('Author: Team\n', 'Author: Team\nExtra: one\nExtra: two\n').replace('- Create a commit\n', ''),
    ],
  ])('round-trips %s exactly', async (_name, before, after) => {
    const { repo, api } = create();
    const path = 'a quoted "file"\t[ä].txt';
    await api.git.writeRepoFile(path, before);
    await api.git.stagePaths([path]);
    const patch = demoTextDiff(path, before, after);
    expect((await api.git.applyPatch(patch, { cached: true })).success).toBe(true);
    expect(repo.indexFiles[path]).toBe(after);
    expect((await api.git.applyPatch(patch, { cached: true, reverse: true })).success).toBe(true);
    expect(repo.indexFiles[path]).toBe(before);
    expect(repo.files[path]).toBe(before);
  });
});

it.skipIf(spawnSync('git', ['--version'], { windowsHide: true }).status !== 0)(
  'produces multi-hunk, creation, deletion and newline patches accepted by isolated real Git',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'ogc-practice-patch-'));
    const safeRoot = resolve(root);
    if (dirname(safeRoot) !== resolve(tmpdir()) || !basename(root).startsWith('ogc-practice-patch-')) throw new Error('Unsafe practice test directory.');
    const config = join(root, 'empty-git-config');
    writeFileSync(config, '');
    const git = (...args: string[]) =>
      spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', ...args], {
        cwd: root,
        env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
        windowsHide: true,
        encoding: 'utf8',
      });
    try {
      expect(git('init', '--quiet').status).toBe(0);
      const examples: Array<[string | undefined, string | undefined]> = [
        [HUNK_CONTENT.head, HUNK_CONTENT.all],
        [undefined, 'new\n'],
        ['old\n', undefined],
        ['one', 'one\n'],
        ['one\n', 'one'],
        ['a\r\nb\r\n', 'a\r\nB\r\n'],
        [HUNK_CONTENT.head, HUNK_CONTENT.head.replace('Author: Team\n', 'Author: Team\nExtra: one\nExtra: two\n').replace('- Create a commit\n', '')],
      ];
      examples.forEach(([before, after], index) => {
        const file = `example ${index} [ä].txt`;
        if (before !== undefined) {
          writeFileSync(join(root, file), before);
          expect(git('add', '--', file).status).toBe(0);
        }
        const result = spawnSync('git', ['-c', 'core.autocrlf=false', 'apply', '--cached', '-'], {
          cwd: root,
          env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' },
          input: demoTextDiff(file, before, after),
          encoding: 'utf8',
          windowsHide: true,
        });
        expect(result.status, result.stderr).toBe(0);
        const contents = git('show', ':' + file);
        if (after === undefined) expect(contents.status).not.toBe(0);
        else expect(contents.stdout).toBe(after);
      });
    } finally {
      rmSync(safeRoot, { recursive: true, force: true });
    }
  },
);
