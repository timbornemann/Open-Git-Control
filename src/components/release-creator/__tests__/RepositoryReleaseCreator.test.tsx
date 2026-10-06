// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import type { HostedRepository, HostingCapabilities } from '@/types/hostingDtos';
import { RepositoryReleaseCreator } from '../RepositoryReleaseCreator';
import { releaseDraftKey, useReleaseDraftState } from '../releaseDraftState';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  generate: vi.fn(),
  target: null as unknown,
  config: vi.fn(),
  tab: vi.fn(),
  toast: vi.fn(),
  branch: 'main',
}));
vi.mock('@/hooks/useAppToast', () => ({ useAppToast: () => mocks.toast }));
vi.mock('../useReleaseTarget', () => ({ useReleaseTarget: () => mocks.target }));
vi.mock('@/services/hostingClient', () => ({ hostingClient: { request: mocks.request, sessionVersion: () => 0 } }));
vi.mock('@/services/aiClient', () => ({ aiClient: { generateReleaseNotes: mocks.generate } }));
vi.mock('@/services/appClient', () => ({ appClient: { selectFiles: async () => [] } }));
vi.mock('@/contexts/AppStateContext', () => ({
  useGitStore: (select: (state: unknown) => unknown) => select({ currentBranch: mocks.branch, refreshTrigger: 0, triggerRefresh: vi.fn() }),
  useSettingsStore: (select: (state: unknown) => unknown) => select({ settings: { language: 'en' } }),
  useUIStore: (select: (state: unknown) => unknown) => select({ onOpenRemoteConfig: mocks.config, setActiveTab: mocks.tab, setConfirmDialog: vi.fn() }),
  useAppStateReader: () => () => ({ repository: { activeRepo: 'C:/repo' } }),
}));

const repository = (id: string): HostedRepository => ({
  ref: { connectionId: id, repositoryId: '1', fullPath: 'team/repo' },
  name: 'repo',
  fullName: 'team/repo',
  description: null,
  cloneUrl: 'https://forge.example/team/repo.git',
  htmlUrl: 'https://forge.example/team/repo',
  defaultBranch: 'main',
  private: true,
  fork: false,
});
const capabilities = { releases: 'native', releaseAssets: true, draftRelease: true, prerelease: true } as HostingCapabilities;
const history = {
  existingTags: ['v1.0.0'],
  lastReleaseTag: 'v1.0.0',
  repositoryHtmlUrl: 'https://forge.example/team/repo',
  targetOid: 'a'.repeat(40),
  commitsTarget: 'main',
  fallbackUsed: false,
  commitsSinceLastRelease: [
    {
      hash: 'a'.repeat(40),
      shortHash: 'aaaaaaa',
      subject: 'after last release',
      description: 'Preserve existing settings.\n\n- Include migration details.',
      author: 'Author',
      date: '2026-10-06',
    },
  ],
};
function target(id: string, caps = capabilities) {
  const repo = repository(id);
  const endpoint = { repoPath: 'C:/repo', remoteName: 'origin', url: repo.cloneUrl, repository: repo.ref };
  return { scope: id, repository: repo, endpoint, choices: [endpoint], capabilities: caps, loading: false, missingTarget: false, error: '', choose: vi.fn() };
}
let root: Root;
let host: HTMLDivElement;
const render = async (repoPath = 'C:/repo') =>
  act(async () => {
    root.render(createElement(I18nProvider, { language: 'en' }, createElement(RepositoryReleaseCreator, { repoPath, requestedTarget: null })));
  });
const click = async (text: string) =>
  act(async () => {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
    expect(button).toBeTruthy();
    button!.click();
  });
async function notes(value: string) {
  await act(async () => {
    const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value: T) => resolve(value),
  };
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useReleaseDraftState.setState({ sessions: {} });
  mocks.target = target('forgejo');
  mocks.branch = 'main';
  mocks.request.mockReset();
  mocks.generate.mockReset();
  mocks.request.mockResolvedValue(history);
  mocks.generate.mockResolvedValue({ success: true, data: { markdown: 'AI notes', source: 'ai' } });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.clearAllMocks();
});

describe('full repository release creator', () => {
  it.each(['Patch', 'Minor', 'Major'])('generates the %s template and a full commit list without an AI or network request', async (version) => {
    await render();
    await click(version);
    mocks.request.mockClear();
    await click('Generate notes from template');
    const body = host.querySelector<HTMLTextAreaElement>('textarea')!.value;
    expect(body).toContain(`This ${version.toLowerCase()} release`);
    expect(body).toContain('  Preserve existing settings.\n\n  - Include migration details.');
    expect(body.match(/## Commit List/g)).toHaveLength(1);
    expect(body).not.toContain('Breaking Changes');
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('can prepare editable local notes without hosting metadata, using an explicit local baseline and no AI', async () => {
    mocks.target = { ...target('offline'), repository: null, capabilities: null, error: 'Network unavailable' };
    mocks.request.mockImplementation(async (operation) => {
      if (operation === 'releaseNotesCommits')
        return [{ sha: 'b'.repeat(40), message: 'fix: offline notes', description: 'Preserve configuration.', author: 'Author', date: '2026-10-06' }];
      throw new Error('Unexpected network request');
    });
    await render();
    await click('Patch');
    await act(async () => {
      const key = releaseDraftKey('C:/repo', repository('offline').ref, 'origin');
      useReleaseDraftState.getState().update(key, (previous) => ({ ...previous!, form: { ...previous!.form, fromRef: 'v1.0.0' } }));
    });
    await click('Generate notes from template');
    expect(mocks.request).toHaveBeenCalledWith('releaseNotesCommits', { repoPath: 'C:/repo', toRef: 'main', fromRef: 'v1.0.0' });
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('  Preserve configuration.');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(false);
    expect((host.querySelector('.release-primary-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('passes descriptions to AI and omits placeholder breaking sections from the result', async () => {
    await render();
    mocks.generate.mockResolvedValue({ success: true, data: { markdown: '# Release\n\n## Breaking Changes\n- None\n\n## Fixed\n- Content.', source: 'ai' } });
    await click('Generate release notes with AI');
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ commits: [expect.objectContaining({ description: history.commitsSinceLastRelease[0].description })] }),
    );
    const body = host.querySelector<HTMLTextAreaElement>('textarea')!.value;
    expect(body).not.toContain('Breaking Changes');
    expect(body).not.toContain('None');
    expect(body).toContain('  Preserve existing settings.');
  });

  it('does not append a second automatic list to the backend offline fallback', async () => {
    await render();
    mocks.generate.mockResolvedValue({
      success: true,
      data: { markdown: '# Release\n\n## Commit List (Automatic)\n- after last release', source: 'fallback' },
    });
    await click('Generate release notes with AI');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value.match(/## Commit List/g)).toHaveLength(1);
  });

  it('preserves the draft on local history failure and ignores late local history after a repository switch', async () => {
    mocks.target = { ...target('offline'), repository: null, capabilities: null, error: 'Network unavailable' };
    mocks.request.mockRejectedValue(new Error('Notes baseline not found'));
    await render();
    await click('Patch');
    await notes('Keep my draft');
    await click('Generate notes from template');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('Keep my draft');
    expect(mocks.toast).toHaveBeenCalledWith('Notes baseline not found', true);
    const late = deferred<unknown>();
    mocks.request.mockReturnValue(late.promise);
    await click('Generate notes from template');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.disabled).toBe(true);
    await render('C:/other');
    await act(async () => late.resolve([{ sha: 'a'.repeat(40), message: 'private old changes', description: 'Do not cross repositories.' }]));
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    const key = releaseDraftKey('C:/repo', repository('offline').ref, 'origin');
    expect(useReleaseDraftState.getState().sessions[key].form.body).toBe('Keep my draft');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('retains the original version, AI options, history, notes and asset tools without publishing when opened', async () => {
    await render();
    expect(host.querySelector('.release-creator')).toBeTruthy();
    expect([...host.querySelectorAll('.release-version-bump-btn')].map((node) => node.textContent)).toEqual(['Major', 'Minor', 'Patch']);
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('v1.0.1');
    expect(host.querySelector('.release-history')?.textContent || host.textContent).toContain('after last release');
    expect(host.querySelectorAll('.release-ai-option')).toHaveLength(6);
    expect(host.textContent).toContain('Add assets');
    expect(host.textContent).toContain('Draft');
    expect(host.textContent).toContain('Pre-release');
    await click('Minor');
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('v1.1.0');
    expect(mocks.request.mock.calls.every(([operation]) => operation === 'releaseContext')).toBe(true);
  });

  it('keeps notes and options in independent session drafts across repositories and complete hosting identities', async () => {
    await render();
    await notes('private notes');
    mocks.target = target('github');
    await render();
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    await notes('backup notes');
    mocks.target = target('forgejo');
    await render('C:/other');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    await render();
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('private notes');
    await click('Refresh');
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('private notes');
  });

  it('uses provider capabilities for draft, prerelease, uploads and the publication label', async () => {
    mocks.target = target('gitlab', { ...capabilities, draftRelease: false, prerelease: false });
    await render();
    expect(host.querySelectorAll('.release-option-card')).toHaveLength(0);
    expect(host.textContent).toContain('Add assets');
    mocks.target = target('bitbucket', { ...capabilities, releases: 'tags', draftRelease: false, prerelease: false, releaseAssets: false });
    await render();
    expect(host.querySelector('.release-assets-panel')).toBeNull();
    expect(host.querySelector('.release-primary-btn')?.textContent).toContain('Create tag');
    expect(host.textContent).toContain('Copy notes');
    expect(host.textContent).toContain('Save notes as file');
  });

  it('keeps the creator reachable with configuration actions when no hosting target is mapped', async () => {
    mocks.target = { ...target('missing'), endpoint: null, choices: [], repository: null, capabilities: null, missingTarget: true };
    await render();
    expect(host.querySelector('.release-creator')).toBeTruthy();
    expect(host.textContent).toContain('No target configured');
    expect(host.textContent).toContain('Accounts & servers');
    await click('Remote configuration');
    expect(mocks.config).toHaveBeenCalled();
    expect((host.querySelector('.release-primary-btn') as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Hosting target missing'), true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('routes context errors and AI fallback feedback to the central toast without inline messages or repeats on form edits', async () => {
    mocks.request.mockRejectedValueOnce(new Error('Release history access denied'));
    await render();
    expect(mocks.toast).toHaveBeenCalledWith('Release history access denied', true);
    expect(host.textContent).not.toContain('Release history access denied');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    mocks.request.mockResolvedValue({ ...history, fallbackUsed: true, warning: 'Only the latest 150 commits are included.' });
    await click('Refresh');
    expect(mocks.toast).toHaveBeenCalledWith('Only the latest 150 commits are included.', false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Showing recent commits'), false);
    const count = mocks.toast.mock.calls.length;
    await click('Minor');
    expect(mocks.toast).toHaveBeenCalledTimes(count);
    mocks.generate.mockResolvedValue({ success: true, data: { markdown: 'fallback notes', source: 'deterministic', warning: 'AI unavailable' } });
    await click('Generate release notes with AI');
    expect(mocks.toast).toHaveBeenCalledWith('AI unavailable', false);
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('fallback notes');
    expect(host.querySelector('.release-page-message')).toBeNull();
  });

  it('rejects late history and AI results after selecting another hosting account', async () => {
    const late = deferred<typeof history>();
    mocks.request.mockReturnValueOnce(late.promise);
    await render();
    mocks.target = target('github');
    await render();
    await act(async () => late.resolve({ ...history, lastReleaseTag: 'v99.0.0', existingTags: ['v99.0.0'] }));
    expect(host.textContent).not.toContain('v99.0.0');
    const ai = deferred<unknown>();
    mocks.generate.mockReturnValueOnce(ai.promise);
    await click('Generate release notes with AI');
    mocks.target = target('forgejo');
    await render();
    await act(async () => ai.resolve({ success: true, data: { markdown: 'late private notes', source: 'ai' } }));
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(useReleaseDraftState.getState().sessions[releaseDraftKey('C:/repo', repository('github').ref, 'origin')].form.body).toBe('');
  });
});
