import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostingConnection } from '@/types/hostingDtos';
import { prepareGitErrorNotification, type GitErrorEnvironment } from '../gitErrorPresentation';
import { initialRemoteTransferState, useRemoteTransferState } from '@/components/hosting/remoteTransferState';

const mock = vi.hoisted(() => ({
  tools: vi.fn(),
  identity: vi.fn(),
  command: vi.fn(),
  request: vi.fn(),
  session: 0,
  connections: [] as HostingConnection[],
}));
vi.mock('@/app/state/systemToolsStore', () => ({ openSystemTools: mock.tools }));
vi.mock('@/app/state/gitIdentityStore', () => ({ ensureCommitIdentity: mock.identity }));
vi.mock('@/services/gitClient', () => ({ gitClient: { runGitCommandForRepo: mock.command } }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { sessionVersion: () => mock.session }, transferClient: { request: mock.request } }));
vi.mock('@/components/hosting/hostingState', () => ({ useHostingState: { getState: () => ({ connections: mock.connections }) } }));
const url = 'https://forge.test/team/repo.git';
let environment: GitErrorEnvironment;
const context = { repoPath: '/repo', remote: 'forge', url, connectionId: 'selected-account' };
const prepare = (msg: string, gitContext = context) => prepareGitErrorNotification({ msg, isError: true, gitContext }, () => environment);
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
beforeEach(() => {
  vi.clearAllMocks();
  useRemoteTransferState.setState(initialRemoteTransferState());
  mock.session = 0;
  mock.connections = [];
  environment = {
    repoPath: '/repo',
    tr: (_de, en) => en,
    notify: vi.fn(),
    openWorkspace: vi.fn(),
    openRepositories: vi.fn(),
    openAccounts: vi.fn(),
    openRemoteConfiguration: vi.fn(),
    openConflict: vi.fn(),
  };
  mock.request.mockImplementation(async (operation) =>
    operation === 'getRemotes'
      ? { remotes: [{ name: 'forge', fetchUrls: [url], pushUrls: [url] }] }
      : operation === 'getPreferences'
        ? { bindings: [{ remoteName: 'forge', url, repository: { connectionId: 'selected-account' } }] }
        : true,
  );
});
describe('repository-bound Git remedies', () => {
  it('opens the tool manager without installing software or running Git', async () => {
    useRemoteTransferState.setState({ phase: 'result', resultVisible: true });
    const notification = prepare('spawn git ENOENT');
    environment = { ...environment, repoPath: '/other' };
    notification.actions![0].onClick();
    await settle();
    expect(mock.tools).toHaveBeenCalledWith('git');
    expect(mock.request).not.toHaveBeenCalled();
    expect(mock.command).not.toHaveBeenCalled();
    expect(useRemoteTransferState.getState()).toMatchObject({ phase: 'result', resultVisible: false });
  });
  it('opens the selected hosting account only after checking the endpoint binding', async () => {
    const result = prepare('fatal: Authentication failed');
    expect(result.actions![0].label).toBe('Sign in');
    result.actions![0].onClick();
    await settle();
    expect(environment.openAccounts).toHaveBeenCalledWith('selected-account');
    expect(mock.request.mock.calls.map(([operation]) => operation)).toEqual(['getRemotes', 'getPreferences']);
  });
  it('verifies the exact failed endpoint without executing a transfer', async () => {
    prepare('fatal: The requested URL returned error: 502').actions![0].onClick();
    await settle();
    expect(mock.request).toHaveBeenCalledExactlyOnceWith('checkConnection', { repoPath: '/repo', remote: 'forge', url, connectionId: 'selected-account' });
    expect(environment.notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'success', msg: expect.stringContaining('reachable') }));
  });
  it.each(['repository', 'account session'])('rejects a remedy after changing the %s', async (change) => {
    const result = prepare('fatal: Authentication failed');
    if (change === 'repository') environment = { ...environment, repoPath: '/other' };
    else mock.session++;
    result.actions![0].onClick();
    await settle();
    expect(mock.request).not.toHaveBeenCalled();
    expect(environment.openAccounts).not.toHaveBeenCalled();
    expect(environment.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'info' }));
  });
  it('refuses login against a changed URL or account binding', async () => {
    mock.request.mockResolvedValueOnce({ remotes: [{ name: 'forge', fetchUrls: ['https://other.test/repo'], pushUrls: [] }] });
    prepare('fatal: Authentication failed').actions![0].onClick();
    await settle();
    expect(environment.openAccounts).not.toHaveBeenCalled();
    expect(environment.notify).toHaveBeenCalledWith(expect.objectContaining({ isError: true, msg: expect.stringContaining('changed') }));
  });
  it('opens an actual current conflict without modifying files', async () => {
    mock.command.mockResolvedValue({ success: true, data: 'UU actual file.txt\n M other.txt' });
    prepare('CONFLICT (content): Merge conflict in old.txt').actions![0].onClick();
    await settle();
    expect(mock.command).toHaveBeenCalledExactlyOnceWith('/repo', 'statusPorcelain');
    expect(environment.openConflict).toHaveBeenCalledWith('actual file.txt');
  });
  it('does not open a conflict from a late status response or an already resolved file', async () => {
    let finish!: (value: unknown) => void;
    mock.command.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    prepare('CONFLICT (content): Merge conflict in old.txt').actions![0].onClick();
    await settle();
    environment = { ...environment, repoPath: '/other' };
    finish({ success: true, data: 'UU actual.txt' });
    await settle();
    expect(environment.openConflict).not.toHaveBeenCalled();
    environment = { ...environment, repoPath: '/repo' };
    mock.command.mockResolvedValue({ success: true, data: ' M resolved.txt' });
    prepare('CONFLICT (content): Merge conflict in old.txt').actions![0].onClick();
    await settle();
    expect(environment.openConflict).not.toHaveBeenCalled();
    expect(environment.notify).toHaveBeenLastCalledWith(expect.objectContaining({ msg: expect.stringContaining('no unresolved') }));
  });
  it('preserves explicit result actions and is idempotent', () => {
    const extra = { label: 'Open result', onClick: vi.fn() };
    const result = prepareGitErrorNotification(
      { msg: 'fatal: Authentication failed', isError: true, gitContext: context, actions: [extra] },
      () => environment,
    );
    expect(result.actions?.map((action) => action.label)).toEqual(['Sign in', 'Open result']);
    expect(prepareGitErrorNotification(result, () => environment)).toBe(result);
  });
});
