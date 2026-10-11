import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editFixture } from './commitMessageEditFixture';
import { backupReference, writeJournal, journalDirectory, type EditJournal } from '../commitMessageEditJournal';

describe('explicit completed recovery cleanup with real Git', () => {
  let fixture: ReturnType<typeof editFixture>;
  let journal: EditJournal;
  let file: string;
  beforeEach(() => {
    fixture = editFixture();
    const common = path.join(fixture.repo, '.git');
    journal = {
      version: 1,
      id: randomUUID(),
      repoPath: fixture.repo,
      commonDir: common,
      gitDir: common,
      oldHead: fixture.hashes[2],
      branch: 'refs/heads/main',
      createdAt: Date.now(),
      state: 'cleaned',
    };
    writeJournal(journal);
    file = path.join(journalDirectory(common), `${journal.id}.json`);
    fixture.git(['update-ref', backupReference(journal), journal.oldHead]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fixture.dispose();
  });
  it('removes only selected, verified references and completed journals; repeated removal is harmless', async () => {
    const head = fixture.git(['rev-parse', 'HEAD']);
    const other = { ...journal, id: randomUUID(), createdAt: journal.createdAt + 1 };
    writeJournal(other);
    fixture.git(['update-ref', backupReference(other), other.oldHead]);
    expect(await fixture.service.completedBackups(fixture.repo)).toHaveLength(2);
    expect(await fixture.service.removeCompletedBackups(fixture.repo, [journal.id])).toBe(1);
    expect(fs.existsSync(file)).toBe(false);
    expect(fixture.git(['for-each-ref', '--format=%(refname)', 'refs/ogc/commit-reword'])).toBe(backupReference(other));
    expect(fixture.git(['rev-parse', 'HEAD'])).toBe(head);
    expect(fixture.git(['cat-file', '-t', journal.oldHead])).toBe('commit');
    expect(await fixture.service.removeCompletedBackups(fixture.repo, [journal.id])).toBe(0);
  });
  it('preserves journals and references when the expected object changes', async () => {
    fixture.git(['update-ref', backupReference(journal), fixture.hashes[0]]);
    expect(await fixture.service.completedBackups(fixture.repo)).toEqual([]);
    await expect(fixture.service.removeCompletedBackups(fixture.repo, [journal.id])).rejects.toThrow('reference changed');
    expect(fs.existsSync(file)).toBe(true);
    expect(fixture.git(['rev-parse', backupReference(journal)])).toBe(fixture.hashes[0]);
  });
  it('can explicitly clean verified backups through the recorded common directory after repository removal', async () => {
    const common = path.join(fixture.repo, '.git');
    expect(await fixture.service.completedBackups(common)).toEqual([expect.objectContaining({ repoPath: common, id: journal.id })]);
    expect(await fixture.service.removeCompletedBackups(common, [journal.id])).toBe(1);
    expect(fs.existsSync(file)).toBe(false);
    expect(fixture.git(['cat-file', '-t', journal.oldHead])).toBe('commit');
  });
  it('never treats a failed Git query as a missing reference', async () => {
    vi.spyOn(fixture.runner, 'withExclusiveWrite').mockImplementation(async (_repo, _label, execute) =>
      execute({
        run: async () => {
          throw new Error('Git unavailable');
        },
        input: async () => '',
      } as never),
    );
    await expect(fixture.service.removeCompletedBackups(fixture.repo, [journal.id])).rejects.toThrow('Git unavailable');
    expect(fs.existsSync(file)).toBe(true);
    expect(fixture.git(['rev-parse', backupReference(journal)])).toBe(journal.oldHead);
  });
  it('rejects pending, future and redirected recovery records without running recovery during inventory', async () => {
    for (const content of [JSON.stringify({ ...journal, state: 'published' }), JSON.stringify({ ...journal, version: 999 }), '{partial']) {
      fs.writeFileSync(file, content);
      expect(await fixture.service.completedBackups(fixture.repo)).toEqual([]);
      await expect(fixture.service.removeCompletedBackups(fixture.repo, [journal.id])).rejects.toThrow('ownership');
      expect(fs.readFileSync(file, 'utf8')).toBe(content);
    }
    await expect(fixture.service.removeCompletedBackups(fixture.repo, ['../HEAD'])).rejects.toThrow('Choose');
  });
  it('protects journal edits which happen during Git reference deletion', async () => {
    const original = fixture.runner.withExclusiveWrite.bind(fixture.runner);
    vi.spyOn(fixture.runner, 'withExclusiveWrite').mockImplementation((repo, label, execute) =>
      original(repo, label, (git) =>
        execute({
          ...git,
          input: async (...args) => {
            const result = await git.input(...args);
            fs.writeFileSync(file, JSON.stringify({ ...journal, state: 'published' }));
            return result;
          },
        }),
      ),
    );
    await expect(fixture.service.removeCompletedBackups(fixture.repo, [journal.id])).rejects.toThrow('journal changed');
    expect(fs.existsSync(file)).toBe(true);
  });
});
