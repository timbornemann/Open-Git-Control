import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hostingClient } from '@/services/hostingClient';
import { requestBranchChange } from '@/components/branch-change/branchChangeDialogState';
import { checkoutHostedChange } from './checkoutHostedChange';
const state = vi.hoisted(() => ({ guided: true }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: vi.fn() } }));
vi.mock('@/services/electronApi', () => ({ getElectronApi: () => (state.guided ? { git: { inspectBranchChange: true } } : null) }));
vi.mock('@/components/branch-change/branchChangeDialogState', () => ({ requestBranchChange: vi.fn() }));
describe('hosted PR branch-change preparation', () => {
  const input = {
    repoPath: '/repo',
    repository: { connectionId: 'account', repositoryId: '42', fullPath: 'team/repo' },
    id: '31',
    expectedHeadSha: 'a'.repeat(40),
  };
  const target = { kind: 'create' as const, branch: 'ogc/change-31', startPoint: input.expectedHeadSha };
  beforeEach(() => {
    vi.clearAllMocks();
    state.guided = true;
    vi.mocked(hostingClient.request).mockResolvedValue(target);
    vi.mocked(requestBranchChange).mockResolvedValue({ switched: true, restored: true, conflicts: [] });
  });
  it('performs the existing explicit fetch preparation and then asks the common assistant to check out', async () => {
    expect(await checkoutHostedChange(input)).toBe(true);
    expect(hostingClient.request).toHaveBeenCalledExactlyOnceWith('prepareChangeRequestCheckout', input);
    expect(requestBranchChange).toHaveBeenCalledExactlyOnceWith('/repo', target);
    expect(vi.mocked(hostingClient.request).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(requestBranchChange).mock.invocationCallOrder[0]);
  });
  it('respects cancellation and never starts a checkout after a failed preparation', async () => {
    vi.mocked(requestBranchChange).mockResolvedValueOnce(null);
    expect(await checkoutHostedChange(input)).toBe(false);
    vi.mocked(requestBranchChange).mockClear();
    vi.mocked(hostingClient.request).mockRejectedValueOnce(new Error('Changed PR head'));
    await expect(checkoutHostedChange(input)).rejects.toThrow('Changed PR head');
    expect(requestBranchChange).not.toHaveBeenCalled();
  });
  it('preserves the legacy IPC contract when the guided API is unavailable', async () => {
    state.guided = false;
    vi.mocked(hostingClient.request).mockResolvedValue(true);
    expect(await checkoutHostedChange(input)).toBe(true);
    expect(hostingClient.request).toHaveBeenCalledExactlyOnceWith('checkoutChangeRequest', input);
  });
});
