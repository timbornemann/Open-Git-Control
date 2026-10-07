// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostedRepository, HostingCapabilities, HostingRun } from '@/types/hostingDtos';
import { HostingCiPanel } from './HostingCiPanel';
import { hostedRepositoryKey, useHostingState } from './hostingState';

const mocks = vi.hoisted(() => ({ request: vi.fn(), toast: vi.fn(), openExternal: vi.fn() }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request } }));
vi.mock('@/services/appClient', () => ({ appClient: { openExternalUrl: mocks.openExternal } }));
vi.mock('@/contexts/AppStateContext', () => ({ useGitStore: (selector: (state: unknown) => unknown) => selector({ onToast: mocks.toast }) }));

const repository: HostedRepository = {
  ref: { connectionId: 'github-backup', repositoryId: '42', fullPath: 'team/app' },
  name: 'app',
  fullName: 'team/app',
  description: 'Private application',
  private: true,
  cloneUrl: 'https://github.com/team/app.git',
  htmlUrl: 'https://github.com/team/app',
  defaultBranch: 'main',
  fork: false,
};
const capabilities: HostingCapabilities = {
  createRepository: true,
  fork: true,
  defaultBranchOnlyFork: false,
  changeRequests: true,
  changeRequestLabel: 'Pull requests',
  mergeMethods: ['merge'],
  ciLabel: 'GitHub Actions',
  runs: true,
  jobs: true,
  steps: true,
  logs: true,
  runLogs: true,
  artifacts: true,
  cancelRun: true,
  retryRun: true,
  dispatch: true,
  releases: 'native',
  releaseAssets: true,
  draftRelease: true,
  prerelease: true,
};
const runs: HostingRun[] = [
  {
    id: '101',
    number: '101',
    name: 'Build and test',
    branch: 'main',
    headSha: 'a'.repeat(40),
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    htmlUrl: `${repository.htmlUrl}/actions/runs/101`,
    createdAt: '2026-10-07T09:00:00Z',
    updatedAt: '2026-10-07T09:01:00Z',
  },
  {
    id: '102',
    name: 'Release preview',
    branch: 'release/v2',
    headSha: 'b'.repeat(40),
    event: 'workflow_dispatch',
    status: 'in_progress',
    conclusion: null,
    htmlUrl: `${repository.htmlUrl}/actions/runs/102`,
    createdAt: '2026-10-07T10:00:00Z',
    updatedAt: '2026-10-07T10:01:00Z',
  },
];
const page = <T,>(items: T[], nextCursor: string | null = null) => ({ items, nextCursor });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
let host: HTMLDivElement;
let root: Root;
const render = (caps = capabilities, repo = repository) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <HostingCiPanel key={hostedRepositoryKey(repo)} repository={repo} capabilities={caps} />
      </I18nProvider>,
    ),
  );
const buttons = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent?.trim() === text);
const click = (element: Element | null | undefined) =>
  act(async () => {
    expect(element).toBeTruthy();
    (element as HTMLElement).click();
  });
const change = (element: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
const submit = () => act(async () => host.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  mocks.toast.mockReset();
  mocks.openExternal.mockReset().mockResolvedValue({ success: true });
  useHostingState.setState({ revision: 0 });
  mocks.request.mockReset().mockImplementation(async (operation: string) => {
    if (operation === 'runs') return page(runs);
    if (operation === 'jobs')
      return page([
        {
          id: 'job-1',
          name: 'Linux build',
          status: 'completed',
          conclusion: 'success',
          htmlUrl: `${repository.htmlUrl}/jobs/1`,
          steps: [{ id: 'step-1', name: 'Run tests', status: 'completed', conclusion: 'success' }],
        },
      ]);
    if (operation === 'artifacts')
      return page([{ id: 'artifact-1', name: 'app-linux.zip', size: 1024 * 1024, expiresAt: '2026-10-14T10:00:00Z', downloadable: true }]);
    if (operation === 'logs') return { text: '\x1b[32mTests passed\x1b[0m\n<script>log text</script>', truncated: false, nextCursor: null };
    if (operation === 'downloadArtifact') return { path: 'C:/Downloads/app-linux.zip' };
    if (operation === 'dispatch' || operation === 'cancelRun' || operation === 'retryRun') return true;
    if (operation === 'status')
      return {
        sha: runs[0].headSha,
        state: 'success',
        checks: [{ id: 'build-1', name: 'External build', status: 'success', htmlUrl: 'https://ci.example/build/1', description: 'All checks passed' }],
      };
    throw new Error(`Unexpected operation: ${operation}`);
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('hosting CI workspace', () => {
  it('selects a run and exposes its jobs, steps, safe logs and artifact actions in the selected repository context', async () => {
    await render();
    expect(host.querySelector('[role="list"]')?.getAttribute('aria-label')).toBe('Run history');
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(host.querySelector('.hosting-run')?.textContent).toContain('aaaaaaaa');
    expect(host.querySelectorAll('time')[0].getAttribute('datetime')).toBe(runs[0].createdAt);
    await click(host.querySelector('.hosting-run'));
    expect(host.querySelector('.hosting-run')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.hosting-ci-detail')?.textContent).toContain('Linux build');
    await click(host.querySelector('.hosting-job__steps summary'));
    expect(host.querySelector<HTMLDetailsElement>('.hosting-job__steps')?.open).toBe(true);
    expect(host.querySelector('.hosting-job__steps li')?.textContent).toContain('Run tests');
    await click(buttons('Logs')[0]);
    expect(mocks.request).toHaveBeenCalledWith('logs', { repository: repository.ref, runId: '101', jobId: 'job-1', cursor: undefined });
    expect(host.querySelector('.hosting-log')?.textContent).toBe('Tests passed\n<script>log text</script>');
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('.hosting-ci-artifact')?.textContent).toContain('1 MiB');
    expect(host.querySelector('.hosting-ci-artifact')?.textContent).toContain('Available until');
    await click(buttons('Download')[0]);
    expect(mocks.request).toHaveBeenCalledWith('downloadArtifact', { repository: repository.ref, runId: '101', artifactId: 'artifact-1' });
    expect(mocks.toast).toHaveBeenCalledWith('Artifact saved: C:/Downloads/app-linux.zip', false);
    await click(host.querySelector('.hosting-ci-detail__actions button'));
    expect(mocks.openExternal).toHaveBeenCalledWith(runs[0].htmlUrl);
  });

  it('starts a run on an independent ref with inputs, guards double submission and reports completion centrally', async () => {
    const dispatched = deferred<boolean>();
    mocks.request.mockImplementationOnce(async () => page(runs));
    await render();
    await click(host.querySelector('.hosting-run'));
    expect(host.querySelector('form')).toBeNull();
    expect(mocks.request).not.toHaveBeenCalledWith('dispatch', expect.anything());
    await click(buttons('Start a new run')[0]);
    const fields = host.querySelectorAll<HTMLInputElement>('.hosting-ci-start input');
    expect(fields[1].value).toBe('main');
    await change(fields[0], ' ci.yml ');
    await change(fields[1], ' release/v2 ');
    await change(host.querySelector<HTMLTextAreaElement>('textarea')!, '{"environment":"staging"}');
    expect(host.querySelector<HTMLInputElement>('.hosting-ci-filter input')?.value).toBe('main');
    expect(host.querySelector('.hosting-ci-detail')?.textContent).toContain('Build and test');
    const originalRequest = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation: string, input: unknown) =>
      operation === 'dispatch' ? dispatched.promise : originalRequest(operation, input),
    );
    await act(async () => {
      const form = host.querySelector<HTMLFormElement>('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'dispatch')).toHaveLength(1);
    expect(mocks.request).toHaveBeenCalledWith('dispatch', {
      repository: repository.ref,
      workflow: 'ci.yml',
      ref: 'release/v2',
      inputs: { environment: 'staging' },
    });
    expect(buttons('Starting …')[0].disabled).toBe(true);
    expect(fields[0].disabled).toBe(true);
    await act(async () => dispatched.resolve(true));
    expect(host.querySelector('form')).toBeNull();
    expect(mocks.toast).toHaveBeenCalledWith('Run started.', false);
    expect(host.querySelector<HTMLInputElement>('.hosting-ci-filter input')?.value).toBe('main');
    expect(mocks.request).not.toHaveBeenCalledWith('runs', expect.objectContaining({ branch: 'release/v2' }));
  });

  it('keeps the draft after invalid inputs or a failed dispatch and closes without starting on cancel', async () => {
    await render();
    await click(buttons('Start a new run')[0]);
    await change(host.querySelector<HTMLInputElement>('.hosting-ci-start input')!, 'ci.yml');
    const inputs = host.querySelector<HTMLTextAreaElement>('textarea')!;
    for (const value of ['{', '{"count":2}', '[]']) {
      await change(inputs, value);
      await submit();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('JSON object with string values');
    }
    expect(mocks.request).not.toHaveBeenCalledWith('dispatch', expect.anything());
    await change(inputs, '{}');
    mocks.request.mockRejectedValueOnce(new Error('Workflow is not configured for manual starts'));
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Workflow is not configured');
    expect(host.querySelector<HTMLInputElement>('.hosting-ci-start input')?.value).toBe('ci.yml');
    await click(buttons('Cancel')[0]);
    expect(host.querySelector('form')).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.request.mock.calls.filter(([operation]) => operation === 'dispatch')).toHaveLength(1);
  });

  it('only offers supported run actions and explains missing detail APIs rather than displaying empty results', async () => {
    await render({ ...capabilities, jobs: false, steps: false, logs: false, runLogs: false, artifacts: false, retryRun: false, dispatch: false });
    await click(host.querySelector('.hosting-run'));
    expect(buttons('Start a new run')).toHaveLength(0);
    expect(buttons('Retry')).toHaveLength(0);
    expect(buttons('Logs')).toHaveLength(0);
    expect(host.textContent).toContain('This server API does not provide job details.');
    expect(host.textContent).toContain('Artifacts are unavailable through this API.');
    expect(mocks.request.mock.calls.some(([operation]) => ['jobs', 'artifacts', 'logs'].includes(operation))).toBe(false);
    await render();
    await click(host.querySelectorAll('.hosting-run')[1]);
    expect(buttons('Retry')).toHaveLength(0);
    await click(buttons('Cancel')[0]);
    expect(mocks.request).toHaveBeenCalledWith('cancelRun', { repository: repository.ref, runId: '102' });
    await click(host.querySelector('.hosting-run'));
    await click(buttons('Retry')[0]);
    expect(mocks.request).toHaveBeenCalledWith('retryRun', { repository: repository.ref, runId: '101' });
  });

  it('shows external build statuses with app actions for providers without native runs', async () => {
    await render({ ...capabilities, runs: false, dispatch: false });
    expect(host.querySelector('h2')?.textContent).toBe('Build status');
    expect(host.querySelector('.hosting-ci-check')?.textContent).toContain('All checks passed');
    expect(mocks.request).toHaveBeenCalledWith('status', { repository: repository.ref, ref: 'main' });
    expect(mocks.request).not.toHaveBeenCalledWith('runs', expect.anything());
    await click(buttons('Open build')[0]);
    expect(mocks.openExternal).toHaveBeenCalledWith('https://ci.example/build/1');
  });

  it('discards a late log after selecting another run', async () => {
    const oldLog = deferred<unknown>();
    await render();
    await click(host.querySelector('.hosting-run'));
    mocks.request.mockImplementationOnce(() => oldLog.promise);
    await click(buttons('Logs')[0]);
    await click(host.querySelectorAll('.hosting-run')[1]);
    await act(async () => oldLog.resolve({ text: 'private old run log', truncated: false, nextCursor: null }));
    expect(host.querySelector('.hosting-ci-detail h3')?.textContent).toContain('Release preview');
    expect(host.querySelector('.hosting-log')).toBeNull();
    expect(host.textContent).not.toContain('private old run log');
  });

  it('does not apply a late manual-start result or old inputs to another hosting account', async () => {
    const dispatched = deferred<boolean>();
    await render();
    await click(buttons('Start a new run')[0]);
    await change(host.querySelector<HTMLInputElement>('.hosting-ci-start input')!, 'private-workflow.yml');
    mocks.request.mockImplementationOnce(() => dispatched.promise);
    await submit();
    await render(capabilities, { ...repository, ref: { ...repository.ref, connectionId: 'forgejo-private' } });
    await act(async () => dispatched.resolve(true));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(host.querySelector('form')).toBeNull();
    await click(buttons('Start a new run')[0]);
    expect(host.querySelector<HTMLInputElement>('.hosting-ci-start input')?.value).toBe('');
  });

  it('does not restore the previously selected run when the filter changes during a manual start', async () => {
    const dispatched = deferred<boolean>();
    await render();
    await click(host.querySelector('.hosting-run'));
    await click(buttons('Start a new run')[0]);
    const originalRequest = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation((operation: string, input: unknown) =>
      operation === 'dispatch' ? dispatched.promise : originalRequest(operation, input),
    );
    await submit();
    await change(host.querySelector<HTMLInputElement>('.hosting-ci-filter input')!, 'release/v2');
    expect(host.querySelector('.hosting-ci-detail')).toBeNull();
    await act(async () => dispatched.resolve(true));
    expect(host.querySelector('.hosting-ci-detail')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('.hosting-ci-filter input')?.value).toBe('release/v2');
    expect(mocks.toast).toHaveBeenCalledWith('Run started.', false);
    expect(mocks.request).toHaveBeenCalledWith('dispatch', { repository: repository.ref, workflow: '', ref: 'main', inputs: {} });
  });
});
