import { describe, expect, it, vi } from 'vitest';
import { HistoryService } from '../git/HistoryService';

const hash = (value: string) => value.repeat(40);

describe('HistoryService regression coverage', () => {
  it('builds a first-parent timeline and attaches the parent tree as its baseline', async () => {
    const newest = hash('a');
    const oldest = hash('b');
    const parent = hash('c');
    const rs = '\x1e';
    const fs = '\x1f';
    const nul = '\x00';
    const output = [
      `${rs}${newest}${fs}Alice${fs}2026-01-02${fs}second`,
      'M',
      'src/existing.ts',
      `${rs}${oldest}${fs}Alice${fs}2026-01-01${fs}first in window`,
      'A',
      'src/new.ts',
    ].join(nul);
    const run = vi.fn().mockResolvedValueOnce(output).mockResolvedValueOnce(`${parent}\n`).mockResolvedValueOnce(`README.md${nul}src/existing.ts${nul}`);
    const service = new HistoryService(run, vi.fn());

    const result = await service.getFileTimelineData(2);

    expect(run).toHaveBeenNthCalledWith(1, expect.arrayContaining(['log', '--first-parent', '--diff-merges=first-parent', '-2', '-z', '--name-status']));
    expect(run).toHaveBeenNthCalledWith(2, ['show', '-s', '--format=%P', oldest]);
    expect(run).toHaveBeenNthCalledWith(3, ['ls-tree', '-r', '--name-only', '-z', parent]);
    expect(result.at(-1)?.baselineFiles).toEqual(['README.md', 'src/existing.ts']);
  });

  it('preserves whitespace in NUL-delimited timeline paths', async () => {
    const commit = hash('a');
    const path = '\n leading and trailing ';
    const output = `\x1e${commit}\x1fAlice\x1f2026-01-02\x1fsubject\x00\nA\x00${path}\x00`;
    const run = vi.fn().mockResolvedValueOnce(output).mockResolvedValueOnce('');
    const service = new HistoryService(run, vi.fn());

    const result = await service.getFileTimelineData(1);

    expect(result[0]?.changes).toEqual([{ status: 'added', path }]);
  });

  it('does not hide baseline read failures as root commits', async () => {
    const commit = hash('a');
    const parent = hash('b');
    const output = `\x1e${commit}\x1fAlice\x1f2026-01-02\x1fsubject\x00`;
    const run = vi.fn().mockResolvedValueOnce(output).mockResolvedValueOnce(parent).mockRejectedValueOnce(new Error('object missing'));
    const service = new HistoryService(run, vi.fn());

    await expect(service.getFileTimelineData(1)).rejects.toThrow('object missing');
  });

  it('uses an explicit record separator for line-range history', async () => {
    const run = vi.fn().mockResolvedValue('');
    const service = new HistoryService(run, vi.fn());

    await service.getForensicHistoryByLineRange('src/app.ts', 3, 8, 20);

    expect(run).toHaveBeenCalledWith(expect.arrayContaining(['--pretty=format:%x1e%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00', '-L3,8:src/app.ts']));
  });

  it('loads commit details as a NUL-delimited first-parent diff', async () => {
    const firstParent = hash('e');
    const run = vi
      .fn()
      .mockResolvedValueOnce(`${firstParent} ${hash('f')}`)
      .mockResolvedValueOnce('M\x00src/app.ts\x00');
    const service = new HistoryService(run, vi.fn());
    const commit = hash('d');

    const result = await service.getCommitDetails(commit);

    expect(run).toHaveBeenNthCalledWith(1, ['show', '-s', '--format=%P', commit]);
    expect(run).toHaveBeenNthCalledWith(2, ['diff', '--name-status', '-M', '-z', firstParent, commit]);
    expect(result).toBe('M\x00src/app.ts\x00');
  });

  it('uses a root diff when the commit has no parent', async () => {
    const run = vi.fn().mockResolvedValueOnce('').mockResolvedValueOnce('A\x00README.md\x00');
    const service = new HistoryService(run, vi.fn());
    const commit = hash('1');

    await expect(service.getCommitDetails(commit)).resolves.toBe('A\x00README.md\x00');
    expect(run).toHaveBeenNthCalledWith(2, ['diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', '-z', commit]);
  });
});
