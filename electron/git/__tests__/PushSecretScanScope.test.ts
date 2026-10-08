import { describe, expect, it, vi } from 'vitest';
import { readPushSecretScanScope } from '../PushSecretScanScope';
import type { Runner } from '../remoteTransferModels';

const base = 'a'.repeat(40);
const source = 'b'.repeat(40);
const absent = 'c'.repeat(40);

function fixture(advertisement = `${base}\trefs/heads/main\n`) {
  const controller = new AbortController();
  const run = vi.fn(async (_path: string, args: string[]) => (args.includes('--is-shallow-repository') ? 'false' : source));
  const runWithInput = vi.fn(async (_path: string, args: string[], input: string | Buffer) => {
    if (args[0] === 'cat-file')
      return String(input)
        .trim()
        .split('\n')
        .map((oid) => `${oid} commit`)
        .join('\n');
    return source;
  });
  const advertise = vi.fn(async () => advertisement);
  const validatePlan = vi.fn(async () => {});
  const dependencies = {
    repoPath: '/repo',
    refs: [{ sourceOid: source, destinationRef: 'refs/heads/main' }],
    targets: [{ id: 'selected', remoteName: 'origin', url: 'https://git.example.invalid/team/repo.git', destinationRef: 'refs/heads/main', sourceOid: source }],
    git: { run, runWithInput } as unknown as Runner,
    context: { ownerId: 1, generation: 1, signal: controller.signal, ensureActive: () => controller.signal.throwIfAborted() },
    validatePlan,
    advertise,
  };
  return { dependencies, controller, run, runWithInput, advertise, validatePlan };
}

describe('Main-owned push secret-scan scope safety', () => {
  it.each([
    'invalid\trefs/heads/main',
    `${base}\trefs/heads/main\n${source}\trefs/heads/main`,
    `${base}\trefs/tags/orphan^{}`,
    `${base}\trefs/remotes/origin/main`,
  ])('does not treat a malformed advertisement as a verified empty server: %s', async (advertisement) => {
    const f = fixture(advertisement);
    const scope = await readPushSecretScanScope(f.dependencies);
    expect(scope.summary).toMatchObject({ mode: 'full', totalCommits: 1, endpointCount: 1 });
    expect(scope.summary.fallbackReasons[0]).toContain('Full history scan');
    expect(scope.historyCommits).toEqual([source]);
    expect(f.runWithInput).toHaveBeenCalledWith('/repo', expect.arrayContaining(['rev-list']), `${source}\n`, expect.anything());
  });

  it('proves synchronization without history traversal even when unrelated remote branches are unavailable locally', async () => {
    const f = fixture(`${source}\trefs/heads/main\n${absent}\trefs/heads/unfetched`);
    const scope = await readPushSecretScanScope(f.dependencies);
    expect(scope.summary).toMatchObject({ mode: 'incremental', totalCommits: 0, fallbackReasons: [] });
    expect(f.runWithInput).not.toHaveBeenCalled();
    await scope.assertCurrent();
    expect(f.advertise).toHaveBeenCalledTimes(2);
  });

  it('never turns a cancelled remote query into a full-history approval', async () => {
    const f = fixture();
    f.advertise.mockImplementationOnce(async () => {
      f.controller.abort();
      f.controller.signal.throwIfAborted();
      return '';
    });
    await expect(readPushSecretScanScope(f.dependencies)).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.runWithInput).not.toHaveBeenCalled();
  });

  it('validates the plan again after remote inspection rather than approving a changed account or repository', async () => {
    const f = fixture(`${source}\trefs/heads/main`);
    f.validatePlan.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Hosting authentication changed.'));
    await expect(readPushSecretScanScope(f.dependencies)).rejects.toThrow('Hosting authentication changed');
    expect(f.advertise).toHaveBeenCalledOnce();
  });

  it('blocks an unreadable full fallback instead of silently checking no commits', async () => {
    const f = fixture();
    f.advertise.mockRejectedValue(new Error('Endpoint unreachable'));
    f.runWithInput.mockRejectedValue(new Error('Missing source history'));
    await expect(readPushSecretScanScope(f.dependencies)).rejects.toThrow('Missing source history');
  });

  it('redacts server credentials and tokens in fallback explanations', async () => {
    const f = fixture();
    f.advertise.mockRejectedValue(new Error('Request to https://user:private-password@git.example.invalid/repo?token=private-token failed.'));
    const scope = await readPushSecretScanScope(f.dependencies);
    expect(scope.summary.fallbackReasons[0]).not.toContain('private-password');
    expect(scope.summary.fallbackReasons[0]).not.toContain('private-token');
    expect(scope.summary.fallbackReasons[0]).toContain('[REDACTED]');
  });

  it('passes large verified baseline sets over stdin instead of expanding the process command line', async () => {
    const oids = Array.from({ length: 1000 }, (_, index) => index.toString(16).padStart(40, '0'));
    const f = fixture(oids.map((oid, index) => `${oid}\trefs/heads/branch-${index}`).join('\n'));
    await readPushSecretScanScope(f.dependencies);
    const [, args, input] = f.runWithInput.mock.calls.find(([, args]) => args[0] === 'rev-list')!;
    expect(args).toEqual(['rev-list', '--reverse', '--topo-order', '--stdin']);
    expect(String(input)).toContain(`^${oids.at(-1)}\n`);
    expect(String(input).split('\n')).toHaveLength(1002);
  });
});
