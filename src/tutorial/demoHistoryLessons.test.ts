import { describe, expect, it } from 'vitest';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DemoRepository } from './demoRepository';
import { demoCommitChanges, demoFileBlame, demoFileHistory } from './demoHistory';
import { historyText } from './demoHistoryExamples';
import { demoBlobText } from './demoBlob';
import { writeDemoFile } from './demoFiles';
import { matchesTutorialWorkingTree } from './matchesTutorialWorkingTree';

const chapters = TUTORIAL_CHAPTERS.filter((chapter) => chapter.id === 'history' || chapter.id.startsWith('history-'));
describe.each(['de', 'en'] as const)('history lessons in %s', (language) => {
  it('restores every checkpoint with consistent HEAD/index/worktree versions', () => {
    expect(chapters).toHaveLength(8);
    for (const chapter of chapters) {
      for (const step of chapter.steps) {
        const repo = new DemoRepository();
        repo.reset(step, language);
        expect(
          repo.commits.map((commit) => commit.hash),
          `${chapter.id}/${step.id}`,
        ).toEqual([hash(4), hash(3), hash(2), hash(1)]);
        expect(demoBlobText(repo.headFiles['README.md'])).toBe(historyText('latest', language));
        expect(demoBlobText(repo.commits[3].files!['README.md'])).toBe(historyText('initial', language));
        const work = step.prepare?.edits?.some((edit) => edit.path === 'README.md');
        const index = step.prepare?.indexEdits?.some((edit) => edit.path === 'README.md');
        expect(demoBlobText(repo.files['README.md'])).toBe(historyText(work ? 'work' : 'latest', language));
        expect(demoBlobText(repo.indexFiles['README.md'])).toBe(historyText(index ? 'index' : 'latest', language));
        expect([...repo.staged]).toEqual(index ? ['README.md'] : []);
        expect([...repo.modified]).toEqual(work || index ? ['README.md'] : []);
        expect(step.action).toBeUndefined();
      }
    }
  });
  it('backs the explained histories and statuses with actual changes', () => {
    const repo = new DemoRepository();
    repo.reset(chapters[0].steps[0], language);
    expect(demoCommitChanges(repo, repo.commits[0]).map(({ path, status }) => [path, status])).toEqual([
      ['README.md', 'M'],
      ['src/app.ts', 'M'],
    ]);
    expect(demoCommitChanges(repo, repo.commits[3]).map(({ path, status }) => [path, status])).toEqual([
      ['LICENSE', 'A'],
      ['README.md', 'A'],
    ]);
    expect(demoFileHistory(repo, 'README.md').map((entry) => entry.hash)).toEqual([hash(4), hash(3), hash(2), hash(1)]);
    expect(demoFileHistory(repo, 'src/app.ts').map((entry) => entry.hash)).toEqual([hash(4), hash(2)]);
    expect(demoFileHistory(repo, 'LICENSE').map((entry) => entry.hash)).toEqual([hash(1)]);
    expect(demoFileHistory(repo, 'README.md', hash(1)).map((entry) => entry.hash)).toEqual([hash(1)]);
    expect(demoFileHistory(repo, 'README.md', hash(1), 100, { includeFuture: true }).map((entry) => entry.hash)).toEqual([hash(4), hash(3), hash(2), hash(1)]);
  });
  it('keeps unchanged line origins and recognizes a saved uncommitted greeting', () => {
    const repo = new DemoRepository();
    repo.reset(chapters[2].steps[0], language);
    expect(demoFileBlame(repo, 'README.md').map((line) => line.commitHash)).toEqual([hash(1), hash(2), hash(4), hash(4)]);
    writeDemoFile(repo, 'README.md', historyText('work', language));
    expect(demoFileBlame(repo, 'README.md').map((line) => line.commitHash)).toEqual([hash(1), hash(2), '0'.repeat(40), hash(4)]);
    const save = chapters[2].steps.find((step) => step.id === 'save')!;
    if (save.completion?.kind !== 'all') throw new Error('The save lesson must verify the resulting file state.');
    const condition = save.completion.conditions.find((rule) => rule.kind === 'working-tree')!;
    if (condition.kind !== 'working-tree') throw new Error('Missing saved state condition.');
    expect(matchesTutorialWorkingTree(repo, condition, language)).toBe(true);
    expect(repo.commits).toHaveLength(4);
    expect(demoBlobText(repo.indexFiles['README.md'])).toBe(historyText('latest', language));
  });
  it('keeps working, indexed and committed blame contents separate', () => {
    const repo = new DemoRepository();
    repo.reset(chapters[3].steps[0], language);
    for (const [source, version] of [
      ['unstaged', 'work'],
      ['staged', 'index'],
    ] as const) {
      const lines = demoFileBlame(repo, 'README.md', undefined, source);
      expect(lines[2]).toMatchObject({ content: historyText(version, language).split('\n')[2], commitHash: '0'.repeat(40) });
      expect(lines[3].commitHash).toBe(hash(4));
    }
    const saved = demoFileBlame(repo, 'README.md', hash(4));
    expect(saved[2]).toMatchObject({ content: historyText('latest', language).split('\n')[2], commitHash: hash(4), author: 'Alex Beispiel' });
    expect(saved[0].author).toBe('Sam Beispiel');
    expect(demoBlobText(repo.files['README.md'])).toBe(historyText('work', language));
    expect(demoBlobText(repo.indexFiles['README.md'])).toBe(historyText('index', language));
  });
});
