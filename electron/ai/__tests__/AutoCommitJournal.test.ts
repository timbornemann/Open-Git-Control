import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AutoCommitJournal } from '../AutoCommitJournal';
import { repository, cleanRepositories } from './repositoryFixture';

describe('AI commit crash recovery', { timeout: 15000 }, () => {
  afterEach(cleanRepositories);

  async function prepared() {
    const repo = await repository();
    const index = path.join(repo.repoPath, '.git', 'index');
    const head = await repo.run(['rev-parse', 'HEAD']);
    const ref = await repo.run(['symbolic-ref', 'HEAD']);
    const privateIndex = path.join(repo.repoPath, '.git', 'ai-test.index');
    fs.copyFileSync(index, privateIndex);
    repo.write('base.txt', 'captured\n');
    const isolated = (args: string[]) =>
      repo.git.runCommandAtPathWithEnv(repo.repoPath, args, { GIT_INDEX_FILE: privateIndex, GIT_REFLOG_ACTION: 'open-git-control-ai-test-journal' });
    await isolated(['add', 'base.txt']);
    const tree = await isolated(['write-tree']);
    fs.copyFileSync(privateIndex, `${index}.lock`);
    const journal = new AutoCommitJournal(index);
    journal.prepare({ head, ref, tree, action: 'open-git-control-ai-test-journal' });
    return { ...repo, index, head, isolated, journal, tree };
  }

  it('removes only its prepared lock when interrupted before the commit', async () => {
    const repo = await prepared();
    expect(await repo.journal.recover(repo.run)).toBe(true);
    expect(fs.existsSync(`${repo.index}.lock`)).toBe(false);
    expect(await repo.run(['rev-parse', 'HEAD'])).toBe(repo.head);
    expect(await repo.run(['show', ':base.txt'])).toBe('base');
    expect(fs.readFileSync(path.join(repo.repoPath, 'base.txt'), 'utf8')).toBe('captured\n');
  });

  it('finishes index promotion after the ref was committed without creating another commit', async () => {
    const repo = await prepared();
    await repo.isolated(['commit', '-m', 'fix: captured changes']);
    expect(await repo.journal.recover(repo.run)).toBe(true);
    expect(await repo.run(['write-tree'])).toBe(repo.tree);
    expect(await repo.run(['rev-list', '--count', 'HEAD'])).toBe('2');
    expect(await repo.journal.recover(repo.run)).toBe(false);
  });

  it('recognizes an already promoted index after interruption', async () => {
    const repo = await prepared();
    await repo.isolated(['commit', '-m', 'fix: captured changes']);
    fs.renameSync(`${repo.index}.lock`, repo.index);
    expect(await repo.journal.recover(repo.run)).toBe(true);
    expect(await repo.run(['rev-list', '--count', 'HEAD'])).toBe('2');
  });

  it('preserves an unrelated lock and foreign commits', async () => {
    const repo = await prepared();
    fs.writeFileSync(`${repo.index}.lock`, 'unrelated lock');
    await expect(repo.journal.recover(repo.run)).rejects.toThrow('needs inspection');
    expect(fs.readFileSync(`${repo.index}.lock`, 'utf8')).toBe('unrelated lock');
    expect(await repo.run(['rev-parse', 'HEAD'])).toBe(repo.head);
  });
});
