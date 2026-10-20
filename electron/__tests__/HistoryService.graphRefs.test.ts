import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { HistoryService } from '../git/HistoryService';

function removeFixture(root: string) {
  const target = path.resolve(root);
  if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('ogc-graph-refs-'))
    throw new Error('Unsafe graph fixture cleanup');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

describe('complete graph ref decorations', () => {
  it('uses a cancellable tip-only read with structured separators', async () => {
    const hash = 'a'.repeat(40);
    const run = vi.fn().mockResolvedValue(`${hash}\x00commit\x00\x00\x00refs/heads/main\x00*\n${hash}\x00commit\x00\x00\x00refs/tags/v1,rc\x00 `);
    const service = new HistoryService(vi.fn(), run);
    const signal = new AbortController().signal;
    expect(await service.getGraphRefs('/repo', signal, 'background')).toEqual({ [hash]: ['HEAD -> main', 'tag: v1,rc'] });
    expect(run).toHaveBeenCalledWith('/repo', expect.arrayContaining(['for-each-ref']), signal, 'background');
    expect(run).toHaveBeenCalledOnce();
  });

  it('reads detached HEAD, annotated tags and remote tips while excluding internal recovery refs with real Git', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-graph-refs-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', root, ...args], {
        windowsHide: true,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.test',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.test',
        },
      }).trim();
    try {
      git('init', '-b', 'main');
      git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'base');
      const base = git('rev-parse', 'HEAD');
      git('update-ref', 'refs/remotes/origin/older', base);
      git('-c', 'tag.gpgsign=false', 'tag', '-a', 'v1,rc', '-m', 'release');
      git('-c', 'tag.gpgsign=false', 'tag', '-a', 'nested', 'v1,rc', '-m', 'nested release');
      git('-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'head');
      const head = git('rev-parse', 'HEAD');
      const internal = git('commit-tree', git('rev-parse', 'HEAD^{tree}'), '-m', 'internal only');
      git('update-ref', 'refs/ogc/recovery/private', internal);
      git('checkout', '--detach', head);
      const service = new HistoryService(vi.fn(), async (repo, args) => execFileSync('git', ['-C', repo, ...args], { windowsHide: true, encoding: 'utf8' }));
      const refs = await service.getGraphRefs(root, new AbortController().signal);
      expect(refs[head]).toContain('HEAD');
      expect(refs[base]).toContain('origin/older');
      expect(refs[base]).toContain('tag: v1,rc');
      expect(refs[base]).toContain('tag: nested');
      expect(refs[internal]).toBeUndefined();
      expect(
        Object.values(refs)
          .flat()
          .some((ref) => ref.includes('ogc/')),
      ).toBe(false);
    } finally {
      removeFixture(root);
    }
  }, 20000);
});
