import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitPushBatchDto, GitPushPlanDto, GitRemoteSnapshotDto, PullStrategy, RemotePreferences } from '@/types/remoteTransfers';
import type { SecretScanResultDto } from '@/types/gitDtos';
import { rememberRemoteTransferSelection } from '@/utils/remoteTransferSelection';
import { RemoteTransferCoordinator, type RemoteTransferContext } from './remoteTransferCoordinator';
import { initialRemoteTransferState, useRemoteTransferState } from './remoteTransferState';

const mocked = vi.hoisted(() => ({ request: vi.fn(), scan: vi.fn(), approve: vi.fn(), cancelScan: vi.fn(), command: vi.fn(), addAllowlist: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ transferClient: { request: mocked.request } }));
vi.mock('@/services/repositorySecretScanAllowlistClient', () => ({ addSecretScanFindingPaths: mocked.addAllowlist }));
vi.mock('@/services/gitClient', () => ({
  gitClient: { scanPushSecrets: mocked.scan, approveSecretScanPush: mocked.approve, cancelSecretScan: mocked.cancelScan, runGitCommandForRepo: mocked.command },
}));
let context: RemoteTransferContext;
let snapshot: GitRemoteSnapshotDto;
let preferences: RemotePreferences;
let plan: GitPushPlanDto;
let batch: GitPushBatchDto;
let coordinator: RemoteTransferCoordinator;
const toast = vi.fn();
const refresh = vi.fn();
const openConfiguration = vi.fn();
const cleanScan: SecretScanResultDto = {
  scanned: true,
  strictness: 'balanced',
  findings: [],
  notes: [],
  stats: { checkedLines: 2, stagedLines: 0, toPushLines: 2, tagLines: 0 },
};
const actionCalls = (operation: string) => mocked.request.mock.calls.filter(([name]) => name === operation).map(([, input]) => input);
const choose = (names = ['origin'], branch = 'main', mode: 'remember' | 'ask' = 'remember') =>
  coordinator.choose({ selectedRemoteNames: names, branch, targetBranches: {}, tagNames: [] }, mode);

beforeEach(() => {
  vi.clearAllMocks();
  useRemoteTransferState.setState(initialRemoteTransferState());
  context = { repoPath: '/repo', branch: 'main', accounts: 'account-a', scanEnabled: true };
  snapshot = {
    repoPath: '/repo',
    branch: 'main',
    upstream: { remote: 'origin', branch: 'upstream-main' },
    defaultPushRemote: 'origin',
    supportsPushUrlIsolation: true,
    remotes: [{ name: 'origin', fetchUrls: ['https://forgejo.example/a/repo.git'], pushUrls: ['https://forgejo.example/a/repo.git'] }],
  };
  preferences = {};
  plan = {
    id: 'plan',
    repoPath: '/repo',
    sourceOid: 'a'.repeat(40),
    branch: 'main',
    tagNames: [],
    force: false,
    secretScanArgs: ['__ogc_transfer_scan_plan__', `${'a'.repeat(40)}:refs/heads/main`],
    targets: [
      { id: 'origin-target', remoteName: 'origin', url: snapshot.remotes[0].pushUrls[0], destinationRef: 'refs/heads/main', sourceOid: 'a'.repeat(40) },
    ],
  };
  batch = {
    id: 'batch',
    planId: 'plan',
    repoPath: '/repo',
    sourceOid: plan.sourceOid,
    state: 'success',
    targets: plan.targets.map((target) => ({ ...target, status: 'success', message: 'ok' })),
  };
  mocked.request.mockImplementation(async (operation: string, input: { preferences?: RemotePreferences }) => {
    if (operation === 'getRemotes') return structuredClone(snapshot);
    if (operation === 'getPreferences') return structuredClone(preferences);
    if (operation === 'setPreferences') {
      preferences = structuredClone(input.preferences!);
      return preferences;
    }
    if (operation === 'planPush') return plan;
    if (operation === 'executePush' || operation === 'retryPush') return batch;
    return { output: 'ok' };
  });
  mocked.scan.mockResolvedValue({ success: true, data: cleanScan });
  mocked.approve.mockResolvedValue({ success: true, data: true });
  mocked.cancelScan.mockResolvedValue({ success: true });
  mocked.command.mockResolvedValue({ success: true, data: '' });
  mocked.addAllowlist.mockResolvedValue(undefined);
  coordinator = new RemoteTransferCoordinator({ getContext: () => context, toast, refresh, openConfiguration, tr: (_de, en) => en });
});

describe('shared remote transfer coordinator', () => {
  it('saves a multi-remote source without persisting a one-off strategy override', async () => {
    preferences.pullStrategy = 'merge';
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['backup'], pushUrls: ['backup'] });
    await coordinator.start({ repoPath: '/repo', mode: 'pull', pullMode: 'rebase' });
    await choose(['backup'], 'private-main');
    expect(preferences).toMatchObject({ pullRemote: 'backup', pullStrategy: 'merge', selectionModes: { pull: 'remember' } });
    await coordinator.start({ repoPath: '/repo', mode: 'pull' });
    expect(actionCalls('pull').map(({ remote, branch, mode }) => [remote, branch, mode])).toEqual([
      ['backup', 'private-main', 'rebase'],
      ['backup', 'private-main', 'merge'],
    ]);
  });
  it.each<PullStrategy>(['default', 'rebase', 'merge', 'ff-only'])(
    'uses saved %s for every normal pull and keeps dropdown overrides one-off',
    async (pullStrategy) => {
      preferences.pullStrategy = pullStrategy;
      await coordinator.start({ repoPath: '/repo', mode: 'pull' });
      await coordinator.start({ repoPath: '/repo', mode: 'pull', pullMode: 'no-ff' });
      await coordinator.start({ repoPath: '/repo', mode: 'pull' });
      expect(actionCalls('pull').map((input) => input.mode)).toEqual([pullStrategy, 'no-ff', pullStrategy]);
      expect(actionCalls('pull').map((input) => [input.remote, input.branch])).toEqual(Array(3).fill(['origin', 'upstream-main']));
      expect(actionCalls('setPreferences')).toHaveLength(0);
      expect(preferences.pullStrategy).toBe(pullStrategy);
    },
  );
  it('publishes explicitly captured branches from detached HEAD without applying saved profiles', async () => {
    snapshot.branch = '';
    context.branch = '';
    preferences = { pushRemotes: ['backup'], profiles: [{ id: 'backup', name: 'Backup', remoteNames: ['backup'] }], activeProfileId: 'backup' };
    const branchTargets = [
      { sourceBranch: 'main', destinationBranch: 'main', sourceOid: 'a'.repeat(40) },
      { sourceBranch: 'feature', destinationBranch: 'preview', sourceOid: 'b'.repeat(40) },
    ];
    plan.branch = '';
    plan.branchRefs = branchTargets;
    await coordinator.start({
      repoPath: '/repo',
      mode: 'push',
      destinationBranch: 'main',
      constrainedRemoteNames: ['origin'],
      branchTargets,
      expectedTagRefs: [],
    });
    expect(actionCalls('planPush')[0]).toMatchObject({
      remoteNames: ['origin'],
      branchTargets: branchTargets.map(({ sourceBranch, destinationBranch }) => ({ sourceBranch, destinationBranch })),
      tagNames: [],
      force: false,
    });
    expect(actionCalls('planPush')[0]).not.toHaveProperty('targetBranches');
    expect(actionCalls('executePush')).toHaveLength(1);
    expect(mocked.scan).toHaveBeenCalled();
  });
  it('stops before scanning or pushing when an explicitly captured branch changed', async () => {
    plan.branchRefs = [{ sourceBranch: 'main', destinationBranch: 'main', sourceOid: 'b'.repeat(40) }];
    await coordinator.start({
      repoPath: '/repo',
      mode: 'push',
      destinationBranch: 'main',
      constrainedRemoteNames: ['origin'],
      branchTargets: [{ sourceBranch: 'main', destinationBranch: 'main', sourceOid: 'a'.repeat(40) }],
    });
    expect(actionCalls('executePush')).toHaveLength(0);
    expect(mocked.scan).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('branches or tags changed'), true);
  });
  it('pushes a single remote directly after scanning with no routine review and no implicit tags', async () => {
    preferences = {
      profiles: [{ id: 'old', name: 'Old profile', remoteNames: ['origin'], destinationBranch: 'release', tagNames: ['v1'] }],
      activeProfileId: 'old',
    };
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    expect(actionCalls('planPush')).toEqual([
      { repoPath: '/repo', remoteNames: ['origin'], destinationBranch: 'main', targetBranches: {}, tagNames: [], force: false },
    ]);
    expect(mocked.scan).toHaveBeenCalledWith({ repoPath: '/repo', pushArgs: plan.secretScanArgs, progressId: expect.any(String) });
    expect(actionCalls('executePush')).toHaveLength(1);
    expect(actionCalls('setPreferences')).toHaveLength(0);
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'idle', busy: false });
    expect(toast).toHaveBeenCalledWith('Push completed.', false);
  });
  it('fetches branches and then typed remote tags from the same sole remote', async () => {
    await coordinator.start({ repoPath: '/repo', mode: 'fetch' });
    expect(actionCalls('fetch')).toEqual([
      { repoPath: '/repo', remote: 'origin' },
      { repoPath: '/repo', remote: 'origin', tagsOnly: true },
    ]);
    expect(useRemoteTransferState.getState().phase).toBe('idle');
    expect(refresh).toHaveBeenCalled();
  });
  it('pulls the tracking branch only when it belongs to the selected source', async () => {
    await coordinator.start({ repoPath: '/repo', mode: 'pull', pullMode: 'rebase' });
    expect(actionCalls('pull')).toEqual([{ repoPath: '/repo', remote: 'origin', branch: 'upstream-main', mode: 'rebase' }]);
  });
  it('asks at the first multiple-remote transfer and saves the selection before planning', async () => {
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['https://github.com/a/repo.git'], pushUrls: ['https://github.com/a/repo.git'] });
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    expect(useRemoteTransferState.getState().phase).toBe('selection');
    expect(actionCalls('planPush')).toHaveLength(0);
    await choose(['origin', 'backup'], 'mirror-main');
    expect(preferences.selectionModes).toEqual({ push: 'remember' });
    expect(preferences.pushBranches).toEqual({ main: { origin: 'mirror-main', backup: 'mirror-main' } });
    const names = mocked.request.mock.calls.map(([name]) => name);
    expect(names.indexOf('setPreferences')).toBeLessThan(names.indexOf('planPush'));
    mocked.request.mockClear();
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    expect(actionCalls('setPreferences')).toHaveLength(0);
    expect(actionCalls('executePush')).toHaveLength(1);
    expect(actionCalls('planPush')[0].targetBranches).toEqual({ origin: 'mirror-main', backup: 'mirror-main' });
  });
  it('keeps ask-every-time independent for each action', async () => {
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['backup'], pushUrls: ['backup'] });
    await coordinator.start({ repoPath: '/repo', mode: 'fetch' });
    await choose(['backup'], 'main', 'ask');
    expect(preferences.selectionModes).toEqual({ fetch: 'ask' });
    await coordinator.start({ repoPath: '/repo', mode: 'fetch' });
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'selection', reason: 'always-ask' });
    await coordinator.start({ repoPath: '/repo', mode: 'pull' });
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'selection', reason: 'first-choice' });
  });
  it('re-asks when a remembered target URL changes without silently reducing the target list', async () => {
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['backup'], pushUrls: ['backup'] });
    preferences = rememberRemoteTransferSelection('push', snapshot, {}, { selectedRemoteNames: ['origin', 'backup'] }, 'remember');
    snapshot.remotes[1].pushUrls = ['changed'];
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'selection', reason: 'selection-invalid' });
    expect(actionCalls('planPush')).toHaveLength(0);
  });
  it('asks for a source when there is no Git default instead of treating the selection as an error', async () => {
    snapshot.remotes = [
      { name: 'forgejo', fetchUrls: ['forgejo'], pushUrls: ['forgejo'] },
      { name: 'github', fetchUrls: ['github'], pushUrls: ['github'] },
    ];
    snapshot.upstream = null;
    snapshot.defaultPushRemote = null;
    await coordinator.start({ repoPath: '/repo', mode: 'fetch' });
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'selection', error: '' });
    await choose(['github']);
    expect(actionCalls('fetch')[0]).toEqual({ repoPath: '/repo', remote: 'github' });
  });
  it('requires force confirmation even for the sole remote', async () => {
    await coordinator.start({ repoPath: '/repo', mode: 'push', force: true });
    expect(useRemoteTransferState.getState().phase).toBe('review');
    expect(actionCalls('executePush')).toHaveLength(0);
    await coordinator.approve();
    expect(actionCalls('executePush')).toHaveLength(1);
  });
  it('requires secret approval bound to the exact plan', async () => {
    mocked.scan.mockResolvedValue({ success: true, data: { ...cleanScan, findings: [{ id: 'finding', filePath: 'file', lineNumber: 1, ruleId: 'secret' }] } });
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    expect(useRemoteTransferState.getState().phase).toBe('review');
    expect(actionCalls('executePush')).toHaveLength(0);
    await coordinator.approve();
    expect(mocked.approve).toHaveBeenCalledWith(plan.secretScanArgs, '/repo');
    expect(actionCalls('executePush')).toHaveLength(1);
  });
  it('saves repository exceptions and rescans the same captured plan before pushing', async () => {
    const findings = [{ id: 'finding', filePath: 'docs/example.env', lineNumber: 1, ruleId: 'secret' }];
    mocked.scan.mockResolvedValueOnce({ success: true, data: { ...cleanScan, findings } });
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    await coordinator.allowlistAndRescan();
    expect(mocked.addAllowlist).toHaveBeenCalledWith('/repo', findings);
    expect(mocked.scan.mock.calls.map(([input]) => input.pushArgs)).toEqual([plan.secretScanArgs, plan.secretScanArgs]);
    expect(actionCalls('planPush')).toHaveLength(1);
    expect(mocked.approve).not.toHaveBeenCalled();
    expect(actionCalls('executePush')).toEqual([{ repoPath: '/repo', planId: plan.id }]);
  });
  it('retains force confirmation after exceptions have been saved and rescanned', async () => {
    mocked.scan.mockResolvedValueOnce({ success: true, data: { ...cleanScan, findings: [{ filePath: 'docs/example.env' }] } });
    await coordinator.start({ repoPath: '/repo', mode: 'push', force: true });
    await coordinator.allowlistAndRescan();
    expect(useRemoteTransferState.getState().phase).toBe('review');
    expect(mocked.scan).toHaveBeenCalledTimes(2);
    expect(actionCalls('executePush')).toHaveLength(0);
  });
  it('never pushes or approves an old scan when the policy could not be saved', async () => {
    mocked.scan.mockResolvedValueOnce({ success: true, data: { ...cleanScan, findings: [{ filePath: 'docs/example.env' }] } });
    mocked.addAllowlist.mockRejectedValueOnce(new Error('Secret-scan allowlist changed.'));
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    await coordinator.allowlistAndRescan();
    expect(useRemoteTransferState.getState().error).toContain('allowlist changed');
    expect(mocked.scan).toHaveBeenCalledTimes(1);
    expect(mocked.approve).not.toHaveBeenCalled();
    expect(actionCalls('executePush')).toHaveLength(0);
  });
  it('does not resume an old repository transfer after saving exceptions finishes', async () => {
    mocked.scan.mockResolvedValueOnce({ success: true, data: { ...cleanScan, findings: [{ filePath: 'docs/example.env' }] } });
    let finish!: () => void;
    mocked.addAllowlist.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    const saving = coordinator.allowlistAndRescan();
    for (let index = 0; index < 20 && !finish; index++) await Promise.resolve();
    context = { ...context, repoPath: '/other' };
    coordinator.invalidate();
    finish();
    await saving;
    expect(mocked.scan).toHaveBeenCalledTimes(1);
    expect(actionCalls('executePush')).toHaveLength(0);
  });
  it('blocks an incomplete history scan', async () => {
    mocked.scan.mockResolvedValue({ success: true, data: { ...cleanScan, historyScanIncomplete: true } });
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    await coordinator.approve();
    expect(useRemoteTransferState.getState().phase).toBe('review');
    expect(actionCalls('executePush')).toHaveLength(0);
  });
  it('rebuilds and scans a fresh plan when retrying an incomplete initial scan', async () => {
    mocked.scan.mockResolvedValueOnce({ success: true, data: { ...cleanScan, historyScanIncomplete: true } });
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    const previousPlan = plan;
    plan = { ...plan, id: 'fresh-plan', secretScanArgs: ['__ogc_transfer_scan_fresh-plan__', `${plan.sourceOid}:refs/heads/main`] };
    batch = { ...batch, planId: plan.id };
    await coordinator.retryScan();
    expect(actionCalls('planPush')).toHaveLength(2);
    expect(mocked.scan.mock.calls.map(([input]) => input.pushArgs)).toEqual([previousPlan.secretScanArgs, plan.secretScanArgs]);
    expect(actionCalls('executePush')).toEqual([{ repoPath: '/repo', planId: 'fresh-plan' }]);
    expect(mocked.approve).not.toHaveBeenCalled();
    expect(useRemoteTransferState.getState().phase).toBe('idle');
  });
  it('keeps explicit release targets apart from the normal profile and checks the inspected source OID', async () => {
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['backup'], pushUrls: ['backup'] });
    snapshot.remotes[0].pushUrls.push('https://github.com/a/release-backup.git');
    preferences = rememberRemoteTransferSelection('push', snapshot, {}, { selectedRemoteNames: ['backup'] }, 'remember');
    await coordinator.start({
      repoPath: '/repo',
      mode: 'push',
      constrainedRemoteNames: ['origin'],
      constrainedTargetUrls: { origin: [snapshot.remotes[0].pushUrls[0]] },
      destinationBranch: 'release',
      expectedBranch: 'main',
      expectedSourceOid: plan.sourceOid,
    });
    expect(actionCalls('planPush')[0]).toMatchObject({
      remoteNames: ['origin'],
      targetUrls: { origin: [snapshot.remotes[0].pushUrls[0]] },
      destinationBranch: 'release',
      targetBranches: {},
    });
    expect(actionCalls('setPreferences')).toHaveLength(0);
    expect(actionCalls('executePush')).toHaveLength(1);
    await coordinator.start({ repoPath: '/repo', mode: 'push', constrainedRemoteNames: ['origin'], expectedSourceOid: 'changed' });
    expect(useRemoteTransferState.getState().error).toContain('source commit changed');
    expect(actionCalls('executePush')).toHaveLength(1);
  });
  it('asks for explicit tags even with one remote and never persists the tag selection', async () => {
    await coordinator.start({ repoPath: '/repo', mode: 'push', selectTags: true, tagNames: ['v1'] });
    expect(useRemoteTransferState.getState().phase).toBe('selection');
    await coordinator.choose({ selectedRemoteNames: ['origin'], branch: 'main', targetBranches: {}, tagNames: ['v2'] }, 'remember');
    expect(actionCalls('planPush')[0].tagNames).toEqual(['v2']);
    expect(preferences).not.toHaveProperty('tagNames');
  });
  it('retries partial push results exclusively at failed or uncertain ungrouped endpoints', async () => {
    batch = {
      ...batch,
      state: 'partial',
      targets: [
        batch.targets[0],
        { ...batch.targets[0], id: 'failed', status: 'failed' },
        { ...batch.targets[0], id: 'unknown', status: 'unknown' },
        { ...batch.targets[0], id: 'group', grouped: true, status: 'failed' },
      ],
    };
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    expect(useRemoteTransferState.getState().phase).toBe('result');
    await coordinator.retryPush();
    expect(actionCalls('retryPush')).toEqual([{ repoPath: '/repo', batchId: 'batch', targetIds: ['failed', 'unknown'] }]);
  });
  it('preserves a failed pull source and strategy for recovery', async () => {
    const original = mocked.request.getMockImplementation()!;
    let pulls = 0;
    mocked.request.mockImplementation(async (operation, input) => {
      if (operation === 'pull' && pulls++ === 0) throw new Error('Conflict');
      return original(operation, input);
    });
    preferences.pullStrategy = 'merge';
    await coordinator.start({ repoPath: '/repo', mode: 'pull' });
    expect(useRemoteTransferState.getState().failedPull).toEqual({ repoPath: '/repo', remote: 'origin', branch: 'upstream-main', mode: 'merge' });
    preferences = { pullStrategy: 'rebase', pullRemote: 'backup', pullBranches: { main: 'other' } };
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['backup'], pushUrls: ['backup'] });
    await coordinator.retryPull();
    expect(actionCalls('pull')[1]).toEqual(actionCalls('pull')[0]);
  });
  it('does not save a selection after its endpoint binding changes while the chooser is open', async () => {
    snapshot.remotes.push({ name: 'backup', fetchUrls: ['backup'], pushUrls: ['backup'] });
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    preferences = {
      bindings: [{ remoteName: 'origin', url: snapshot.remotes[0].pushUrls[0], repository: { connectionId: 'other', repositoryId: '1', fullPath: 'a/repo' } }],
    };
    await choose();
    expect(actionCalls('setPreferences')).toHaveLength(0);
    expect(actionCalls('executePush')).toHaveLength(0);
    expect(useRemoteTransferState.getState().error).toContain('account binding changed');
  });
  it('discards completion after a repository or account switch during scanning', async () => {
    let finish!: (result: unknown) => void;
    mocked.scan.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = coordinator.start({ repoPath: '/repo', mode: 'push' });
    for (let index = 0; index < 20 && !finish; index++) await Promise.resolve();
    context = { ...context, repoPath: '/other', accounts: 'account-b' };
    coordinator.invalidate();
    finish({ success: true, data: cleanScan });
    await running;
    expect(actionCalls('executePush')).toHaveLength(0);
    expect(useRemoteTransferState.getState().phase).toBe('idle');
    expect(toast).not.toHaveBeenCalled();
  });
  it('retains endpoint successes when cancellation returns a partial push result', async () => {
    let finish!: (result: GitPushBatchDto) => void;
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation((operation, input) =>
      operation === 'executePush'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : original(operation, input),
    );
    const running = coordinator.start({ repoPath: '/repo', mode: 'push' });
    for (let index = 0; index < 40 && !finish; index++) await Promise.resolve();
    coordinator.cancel();
    finish({ ...batch, state: 'cancelled' });
    await running;
    expect(actionCalls('cancel')).toEqual([{ repoPath: '/repo' }]);
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'result', batch: { state: 'cancelled', targets: [{ status: 'success' }] } });
    expect(toast).toHaveBeenCalledWith('Push cancelled.', false);
    expect(useRemoteTransferState.getState().resultVisible).toBe(false);
  });
  it('opens configuration without performing any transfer', async () => {
    await coordinator.start({ repoPath: '/repo', mode: 'remotes' });
    expect(openConfiguration).toHaveBeenCalledWith('/repo');
    expect(mocked.request).not.toHaveBeenCalled();
  });
  it('does not restore failed pull state after changing repository during the transfer', async () => {
    let fail!: (error: Error) => void;
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation((operation, input) =>
      operation === 'pull'
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : original(operation, input),
    );
    const running = coordinator.start({ repoPath: '/repo', mode: 'pull' });
    for (let index = 0; index < 30 && !fail; index++) await Promise.resolve();
    context = { ...context, repoPath: '/other' };
    coordinator.invalidate();
    fail(new Error('Old pull conflict'));
    await running;
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'idle', failedPull: null });
    expect(refresh).not.toHaveBeenCalled();
  });
  it('stops tag fetching if the source URL changes during the initial fetch', async () => {
    const original = mocked.request.getMockImplementation()!;
    mocked.request.mockImplementation(async (operation, input) => {
      if (operation === 'fetch' && !input.tagsOnly) snapshot.remotes[0].fetchUrls = ['https://changed.example/repo'];
      return original(operation, input);
    });
    await coordinator.start({ repoPath: '/repo', mode: 'fetch' });
    expect(actionCalls('fetch')).toHaveLength(1);
    expect(useRemoteTransferState.getState().error).toContain('remote, or account binding changed');
  });
  it('docks recovery without losing its target or reviewed push plan', async () => {
    batch = { ...batch, state: 'failed', targets: batch.targets.map((target) => ({ ...target, status: 'failed' })) };
    await coordinator.start({ repoPath: '/repo', mode: 'push' });
    coordinator.close();
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'result', resultVisible: false, plan: { id: 'plan' }, batch: { id: 'batch' } });
    coordinator.showResult();
    expect(useRemoteTransferState.getState().resultVisible).toBe(true);
    await coordinator.retryPush();
    expect(actionCalls('retryPush')).toHaveLength(1);
  });
  it.each(['push', 'fetch', 'pull'] as const)('reports cancelled %s preparation/transfers as information without reopening recovery', async (mode) => {
    const operation = mode === 'push' ? 'planPush' : mode;
    const original = mocked.request.getMockImplementation()!;
    let reject!: (error: Error) => void;
    mocked.request.mockImplementation((name, input) =>
      name === operation
        ? new Promise((_resolve, fail) => {
            reject = fail;
          })
        : original(name, input),
    );
    const running = coordinator.start({ repoPath: '/repo', mode });
    for (let index = 0; index < 40 && !reject; index++) await Promise.resolve();
    coordinator.cancel();
    coordinator.cancel();
    reject(new Error('Git operation was aborted.'));
    await running;
    expect(toast).toHaveBeenCalledExactlyOnceWith('Transfer cancelled.', false);
    expect(actionCalls('cancel')).toHaveLength(1);
    expect(useRemoteTransferState.getState()).toMatchObject({ busy: false, cancelling: false, failedPull: null, phase: 'idle', error: 'Transfer cancelled.' });
  });
});
