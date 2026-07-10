import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import { GitService } from '../../GitService';
import { normalizeInteractiveRebaseTodo, RebaseService } from '../RebaseService';

describe('normalizeInteractiveRebaseTodo', () => {
  it('keeps only supported interactive rebase actions', () => {
    expect(normalizeInteractiveRebaseTodo(['pick AAAAAAA add feature', 'reword bbbbbbb improve message', 'drop ccccccc remove experiment'])).toEqual([
      'pick aaaaaaa add feature',
      'reword bbbbbbb improve message',
      'drop ccccccc remove experiment',
    ]);
  });

  it('rejects exec and other directives that the Git todo interpreter could execute', () => {
    expect(() => normalizeInteractiveRebaseTodo(['exec powershell -Command Remove-Item'])).toThrow('Unsupported rebase todo instruction');
    expect(() => normalizeInteractiveRebaseTodo(['pick aaaaaaa safe', 'break'])).toThrow('Unsupported rebase todo instruction');
    expect(() => normalizeInteractiveRebaseTodo(['reword aaaaaaa'])).toThrow('requires a replacement subject');
  });

  it('keeps generated reword messages available when a conflict pauses the rebase before continue', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-reword-pause-'));
    const rebaseStateDir = path.join(repoPath, '.git', 'rebase-merge');
    const todoTarget = path.join(rebaseStateDir, 'git-rebase-todo');
    const messagePath = path.join(rebaseStateDir, 'ogc-reword-0.txt');
    fs.mkdirSync(rebaseStateDir, { recursive: true });

    const run = vi.fn(async (_repoPath: string, args: string[], options: any = {}) => {
      if (args[0] === 'rebase' && args[1] === '-i') {
        expect(options.envOverrides).toMatchObject({ ELECTRON_RUN_AS_NODE: '1', GIT_EDITOR: 'true', LC_ALL: 'C' });
        const quotedParts = [...String(options.envOverrides.GIT_SEQUENCE_EDITOR).matchAll(/"([^"]+)"/g)];
        const helperPath = quotedParts.at(-1)?.[1];
        expect(helperPath).toBeTruthy();
        execFileSync(process.execPath, [String(helperPath), todoTarget], {
          env: { ...process.env, ...options.envOverrides },
        });

        const generatedTodo = fs.readFileSync(todoTarget, 'utf8');
        expect(generatedTodo).toContain(`pick ${'b'.repeat(40)} replace the commit subject`);
        expect(generatedTodo).toContain('exec git commit --amend -F "$(git rev-parse --git-path rebase-merge)/ogc-reword-0.txt"');
        expect(generatedTodo.match(/^exec .*$/m)?.[0]).not.toContain('replace the commit subject');
        expect(fs.readFileSync(messagePath, 'utf8')).toBe('replace the commit subject\n');
        throw new Error('rebase paused for conflict');
      }

      expect(args).toEqual(['rebase', '--continue']);
      expect(options.envOverrides.GIT_EDITOR).toBe('true');
      expect(fs.readFileSync(messagePath, 'utf8')).toBe('replace the commit subject\n');
      return 'continued';
    });
    const service = new RebaseService(() => repoPath, { run });

    try {
      await expect(
        service.startInteractiveRebase('a'.repeat(40), [`reword ${'b'.repeat(40)} replace the commit subject`, `squash ${'c'.repeat(40)} combine this commit`]),
      ).rejects.toThrow('paused for conflict');
      expect(fs.existsSync(messagePath)).toBe(true);
      await expect(service.continueRebase()).resolves.toBe('continued');
    } finally {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('applies a reword after an edit pause in a real repository', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-reword-integration-'));
    const git = (args: string[]) => execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim();
    try {
      git(['init']);
      git(['config', 'user.name', 'Test']);
      git(['config', 'user.email', 'test@example.com']);
      git(['config', 'core.autocrlf', 'false']);
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'base\n', 'utf8');
      git(['add', 'file.txt']);
      git(['commit', '-m', 'base']);
      const baseHash = git(['rev-parse', 'HEAD']);

      fs.appendFileSync(path.join(repoPath, 'file.txt'), 'second\n', 'utf8');
      git(['commit', '-am', 'second subject']);
      const secondHash = git(['rev-parse', 'HEAD']);
      fs.appendFileSync(path.join(repoPath, 'file.txt'), 'third\n', 'utf8');
      git(['commit', '-am', 'third subject']);
      const thirdHash = git(['rev-parse', 'HEAD']);

      const service = new GitService();
      service.setRepoPath(repoPath);
      await service.startInteractiveRebase(baseHash, [`edit ${secondHash} second subject`, `reword ${thirdHash} replacement subject`]);
      expect(fs.existsSync(path.join(repoPath, '.git', 'rebase-merge', 'ogc-reword-0.txt'))).toBe(true);

      await service.continueRebase();

      expect(git(['log', '-1', '--format=%s'])).toBe('replacement subject');
    } finally {
      if (fs.existsSync(path.join(repoPath, '.git', 'rebase-merge'))) {
        git(['rebase', '--abort']);
      }
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
