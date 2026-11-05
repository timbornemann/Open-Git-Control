import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it, vi } from 'vitest';
import { GitService } from '../../GitService';
import { normalizeInteractiveRebaseTodo, RebaseService } from '../RebaseService';
import { configureFixtureRepository, fastImportHistory } from './gitFixtureHistory';

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
    const tempRoot = fs.realpathSync.native(os.tmpdir());
    const repoPath = fs.mkdtempSync(path.join(tempRoot, 'ogc-reword-pause-'));
    const target = path.resolve(repoPath);
    if (path.dirname(target) !== path.resolve(tempRoot) || !path.basename(target).startsWith('ogc-reword-pause-'))
      throw new Error('Unsafe reword fixture cleanup');
    const config = path.join(repoPath, 'empty-config');
    fs.writeFileSync(config, '');
    const gitEnv = {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: config,
      GIT_CONFIG_NOSYSTEM: '1',
    };
    const git = (args: string[], input?: string) =>
      execFileSync('git', args, { cwd: repoPath, env: gitEnv, encoding: 'utf8', windowsHide: true, input, timeout: 30_000 });
    try {
      git(['init', '-b', 'main']);
      configureFixtureRepository(repoPath, 'Test', 'test@example.invalid');
      git(
        ['fast-import', '--quiet'],
        fastImportHistory(
          [{ message: 'base' }, { message: 'old title\n\nA preserved description.\n\n# A literal paragraph.' }, { message: 'following title' }],
          'Test <test@example.invalid>',
        ),
      );
      const [base, selected, following] = git(['rev-list', '--reverse', 'HEAD']).trim().split('\n');
      const rebaseStateDir = path.join(repoPath, '.git', 'rebase-merge');
      const todoTarget = path.join(rebaseStateDir, 'git-rebase-todo');
      const messagePath = path.join(rebaseStateDir, 'ogc-reword-0.txt');
      const expectedMessage = 'replace the commit subject\n\nA preserved description.\n\n# A literal paragraph.\n';
      fs.mkdirSync(rebaseStateDir, { recursive: true });
      const run = vi.fn(async (_repoPath: string, args: string[], options: any = {}) => {
        if (args[0] === 'rebase' && args[1] === '-i') {
          expect(options.envOverrides).toMatchObject({ ELECTRON_RUN_AS_NODE: undefined, GIT_EDITOR: 'true', LC_ALL: 'C' });
          expect(options.envOverrides.GIT_SEQUENCE_EDITOR).toContain('ELECTRON_RUN_AS_NODE=1 ');
          const helperPath = path.join(path.dirname(options.envOverrides.OGC_REBASE_TODO_FILE), 'editor.js');
          execFileSync(process.execPath, [String(helperPath), todoTarget], {
            cwd: repoPath,
            env: { ...gitEnv, ...options.envOverrides },
            windowsHide: true,
            timeout: 30_000,
          });
          const generatedTodo = fs.readFileSync(todoTarget, 'utf8');
          expect(generatedTodo).toContain('pick ' + selected + ' replace the commit subject');
          expect(generatedTodo).toContain('exec git commit --amend --cleanup=verbatim -F "$(git rev-parse --git-path rebase-merge)/ogc-reword-0.txt"');
          expect(generatedTodo.match(/^exec .*$/m)?.[0]).not.toContain('replace the commit subject');
          expect(fs.readFileSync(messagePath, 'utf8')).toBe(expectedMessage);
          throw new Error('rebase paused for conflict');
        }
        expect(args).toEqual(['rebase', '--continue']);
        expect(options.envOverrides.GIT_EDITOR).toBe('true');
        expect(fs.readFileSync(messagePath, 'utf8')).toBe(expectedMessage);
        return 'continued';
      });
      const service = new RebaseService(() => repoPath, { run });
      await expect(
        service.startInteractiveRebase(base, ['reword ' + selected + ' replace the commit subject', 'squash ' + following + ' combine this commit']),
      ).rejects.toThrow('paused for conflict');
      expect(fs.existsSync(messagePath)).toBe(true);
      await expect(service.continueRebase()).resolves.toBe('continued');
    } finally {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
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
