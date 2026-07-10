import { describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { GitService } from '../GitService';

describe('GitService.getLog pagination', () => {
  it('adds --skip for incremental loading and supports head scope', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getLog(120, false, 40);

    expect(runCommandSpy).toHaveBeenCalledTimes(1);
    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining(['log', '--topo-order', '-120', '--skip=40']));
    const args = runCommandSpy.mock.calls[0][0];
    expect(args).not.toContain('--all');
    expect(args).not.toContain('--numstat');
  });

  it('clamps invalid offset to 0', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getLog(50, true, -100);

    const args = runCommandSpy.mock.calls[0][0];
    expect(args).toContain('--skip=0');
    expect(args).toContain('--all');
  });
});

describe('GitService commit statistics', () => {
  it('loads root commit statistics with one first-parent show command', async () => {
    const service = new GitService();
    const run = vi.spyOn(service, 'runCommandAtPathWithSignal').mockResolvedValueOnce('10\t2\tsrc/root.ts');

    await expect(service.getCommitStatsAtPath('C:/repo', 'a'.repeat(40), new AbortController().signal)).resolves.toEqual({
      files: 1,
      additions: 10,
      deletions: 2,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual(['show', '--root', '--first-parent', '--format=', '--numstat', '-r', '-M', 'a'.repeat(40)]);
  });

  it('uses only the first parent for normal and merge commits', async () => {
    const service = new GitService();
    const hash = 'c'.repeat(40);
    const run = vi.spyOn(service, 'runCommandAtPathWithSignal').mockResolvedValueOnce('1\t1\tnormal.ts').mockResolvedValueOnce('2\t3\tmerge.ts');
    const signal = new AbortController().signal;

    await expect(service.getCommitStatsAtPath('C:/repo', hash, signal)).resolves.toEqual({ files: 1, additions: 1, deletions: 1 });
    await expect(service.getCommitStatsAtPath('C:/repo', hash, signal)).resolves.toEqual({ files: 1, additions: 2, deletions: 3 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][1]).toEqual(['show', '--root', '--first-parent', '--format=', '--numstat', '-r', '-M', hash]);
  });
});

describe('GitService file timeline data', () => {
  it('parses structured timeline output without splitting subjects or paths on separators', async () => {
    const service = new GitService();
    const recordSeparator = '\x1e';
    const fieldSeparator = '\x1f';
    const nullSeparator = '\x00';
    const hash = 'a'.repeat(40);
    const runCommandSpy = vi
      .spyOn(service, 'runCommand')
      .mockResolvedValue(
        [
          `${recordSeparator}${hash}${fieldSeparator}Alice${fieldSeparator}2026-01-01 12:00:00 +0000${fieldSeparator}feat: keep | pipe`,
          'M',
          'src/with spaces/file name.ts',
          'R100',
          'src/old name.ts',
          'src/new name.ts',
        ].join(nullSeparator),
      );

    const timeline = await service.getFileTimelineData(50);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining(['-z', '--name-status']));
    expect(timeline).toEqual([
      {
        hash,
        author: 'Alice',
        date: '2026-01-01 12:00:00 +0000',
        subject: 'feat: keep | pipe',
        changes: [
          { status: 'modified', path: 'src/with spaces/file name.ts' },
          { status: 'renamed', oldPath: 'src/old name.ts', path: 'src/new name.ts' },
        ],
      },
    ]);
  });

  it('consumes both paths of a copy (C###) status so no phantom entry is produced', async () => {
    const service = new GitService();
    const recordSeparator = '\x1e';
    const fieldSeparator = '\x1f';
    const nullSeparator = '\x00';
    const hash = 'b'.repeat(40);
    vi.spyOn(service, 'runCommand').mockResolvedValue(
      [
        `${recordSeparator}${hash}${fieldSeparator}Bob${fieldSeparator}2026-02-02 09:00:00 +0000${fieldSeparator}chore: copy config`,
        'C100',
        'config/base.json',
        'config/derived.json',
        'M',
        'src/app.ts',
      ].join(nullSeparator),
    );

    const timeline = await service.getFileTimelineData(50);

    // The copy is recorded as an added file at the destination, and the trailing
    // modified file is parsed correctly (no phantom "M" entry, no dropped copy).
    expect(timeline[0].changes).toEqual([
      { status: 'added', path: 'config/derived.json' },
      { status: 'modified', path: 'src/app.ts' },
    ]);
  });
});

describe('GitService forensic history commands', () => {
  it('builds -S search command with path separator', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByString('needle', 'src/main.ts', 120);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining(['log', '-S', 'needle', '--', ':(literal)src/main.ts', '-120']));
  });

  it('builds -G regex search command with path separator', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByRegex('foo.*bar', 'src/App.tsx', 80);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining(['log', '-G', 'foo.*bar', '--', ':(literal)src/App.tsx', '-80']));
  });

  it('builds -L line range search command', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('ok');

    await service.getForensicHistoryByLineRange('src/App.tsx', 10, 30, 60);

    expect(runCommandSpy).toHaveBeenCalledWith(expect.arrayContaining(['log', '-60', '-L10,30:src/App.tsx']));
  });
});

describe('GitService file blame', () => {
  it('does not run blame for a path that is absent from the requested commit', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValue('');
    const hash = 'd'.repeat(40);

    await expect(service.getFileBlame('src/deleted.ts', hash)).resolves.toBe('');

    expect(runCommandSpy).toHaveBeenCalledTimes(1);
    expect(runCommandSpy).toHaveBeenCalledWith(['ls-tree', '-r', '--name-only', hash, '--', ':(literal)src/deleted.ts']);
  });

  it('uses HEAD for working-tree blame only when the file exists there', async () => {
    const service = new GitService();
    const runCommandSpy = vi.spyOn(service, 'runCommand').mockResolvedValueOnce('src/existing.ts\n').mockResolvedValueOnce('blame output');

    await expect(service.getFileBlameRange('src/existing.ts', undefined, 1, 500)).resolves.toBe('blame output');

    expect(runCommandSpy).toHaveBeenNthCalledWith(1, ['ls-tree', '-r', '--name-only', 'HEAD', '--', ':(literal)src/existing.ts']);
    expect(runCommandSpy).toHaveBeenNthCalledWith(2, ['blame', '--line-porcelain', '-L1,500', '--', 'src/existing.ts']);
  });
});

describe('GitService repo path normalization', () => {
  it('stores repository root when path is inside a git repo', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-git-root-'));
    const nestedDir = path.join(rootDir, 'src', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    execFileSync('git', ['init'], { cwd: rootDir, stdio: 'ignore' });
    const service = new GitService();

    service.setRepoPath(nestedDir);

    expect(path.resolve(service.getRepoPath() || '')).toBe(path.resolve(rootDir));

    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('keeps original path when root lookup fails', () => {
    const plainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-non-repo-'));
    const service = new GitService();

    service.setRepoPath(plainDir);

    expect(path.resolve(service.getRepoPath() || '')).toBe(path.resolve(plainDir));

    fs.rmSync(plainDir, { recursive: true, force: true });
  });
});

describe('GitService Markdown preview reads', () => {
  it('rejects read and write requests through a symlink that escapes the repository', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-symlink-repo-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-symlink-outside-'));
    const outsideFile = path.join(outsideDir, 'secret.txt');
    const linkedFile = path.join(repoDir, 'linked-secret.txt');
    fs.writeFileSync(outsideFile, 'do not expose', 'utf8');

    try {
      try {
        fs.symlinkSync(outsideFile, linkedFile, 'file');
      } catch (error: any) {
        // Windows installations without Developer Mode or symlink permission
        // cannot create the fixture. The production containment check is still
        // covered on every platform where symlinks are available.
        if (error?.code === 'EPERM' || error?.code === 'EACCES') return;
        throw error;
      }

      const service = new GitService();
      service.setRepoPath(repoDir);

      await expect(service.readRepoFile('linked-secret.txt')).rejects.toThrow('outside the current repository');
      await expect(service.writeRepoFile('linked-secret.txt', 'overwrite')).rejects.toThrow('outside the current repository');
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('do not expose');
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('reads Markdown text and linked image assets from working tree, index, and commit', async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-markdown-preview-'));
    try {
      execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
      fs.mkdirSync(path.join(repoDir, 'docs', 'images'), { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'docs', 'README.md'), '# Preview\n\n![Logo](images/logo.png)\n', 'utf8');
      fs.writeFileSync(
        path.join(repoDir, 'docs', 'images', 'logo.png'),
        Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
      );

      const service = new GitService();
      service.setRepoPath(repoDir);

      await expect(service.readRepositoryFileTextAtSource('unstaged', 'docs/README.md')).resolves.toContain('# Preview');
      await expect(service.readRepositoryImageDataUrlAtSource('unstaged', 'docs/images/logo.png')).resolves.toMatchObject({ mimeType: 'image/png' });

      execFileSync('git', ['add', 'docs/README.md', 'docs/images/logo.png'], { cwd: repoDir, stdio: 'ignore' });
      await expect(service.readRepositoryFileTextAtSource('staged', 'docs/README.md')).resolves.toContain('![Logo]');

      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'docs'], { cwd: repoDir, stdio: 'ignore' });
      const commitHash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoDir, encoding: 'utf8' }).trim();

      await expect(service.readRepositoryFileTextAtSource('commit', 'docs/README.md', commitHash)).resolves.toContain('# Preview');
      const image = await service.readRepositoryImageDataUrlAtSource('commit', 'docs/images/logo.png', commitHash);
      expect(image.dataUrl).toMatch(/^data:image\/png;base64,/);
    } finally {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
