// @vitest-environment jsdom
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { act, createElement, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../../../../electron/git/GitRunner';
import { RepositoryFiles } from '../../../../electron/git/RepositoryFiles';
import { RepositoryFileViewerService } from '../../../../electron/git/RepositoryFileViewerService';
import { normalizeDiffPreviewArgs } from '../../../../electron/main-process/diffPreviewPolicy';
import { gitClient } from '@/services/gitClient';
import * as electronApi from '@/services/electronApi';
import type { ElectronGitAPI } from '@/shared/ipc/contracts/electronApi';
import { button, click, editor, initializeViewerMocks, renderViewer, resetViewerMocks, viewerRequest } from './fileViewerHarness';
import { I18nProvider } from '@/i18n';
import { useMainViewInspector } from '@/components/layout/hooks/useMainViewInspector';
import { FileViewer } from '../FileViewer';
import { fileViewerRequestFromDiff } from '../fileViewerRequest';

const repositories: string[] = [];
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
async function waitForView(assertion: () => void) {
  const deadline = Date.now() + 3000;
  let error: unknown;
  do {
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    try {
      assertion();
      return;
    } catch (failure) {
      error = failure;
    }
  } while (Date.now() < deadline);
  throw error;
}
async function renderRepositoryViewer(repoPath: string) {
  const root = createRoot(document.getElementById('viewer-test')!);
  const onRepoChanged = vi.fn();
  const setSelectedCommit = vi.fn();
  const onOpenRepoWorkspace = vi.fn();
  function RepositoryView() {
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const inspector = useMainViewInspector({ activeRepo: repoPath, setSelectedCommit, onOpenRepoWorkspace });
    const request = useMemo(
      () => (inspector.activeDiffRequest ? fileViewerRequestFromDiff(repoPath, inspector.activeDiffRequest) : null),
      [inspector.activeDiffRequest],
    );
    return createElement(
      'div',
      { 'data-selected-source': inspector.workingTreeSelection?.source },
      request
        ? createElement(FileViewer, {
            request,
            refreshTrigger,
            onRepoChanged: () => {
              onRepoChanged();
              setRefreshTrigger((value) => value + 1);
            },
            onClose: inspector.closeInspector,
            onNavigationGuardChange: inspector.setWorkingDirectoryNavigationGuard,
            onRequestChange: ({ path, source, commitHash }) => inspector.handleOpenDiff({ path, source, commitHash }),
          })
        : createElement('button', { onClick: () => inspector.handleOpenDiff({ path: 'file.txt', source: 'unstaged' }) }, 'Open unstaged diff'),
    );
  }
  await act(async () => root.render(createElement(I18nProvider, { language: 'en', children: createElement(RepositoryView) })));
  await click('Open unstaged diff');
  return { props: { onRepoChanged }, unmount: () => act(() => root.unmount()) };
}
beforeEach(initializeViewerMocks);
afterEach(() => {
  resetViewerMocks();
  for (const repo of repositories.splice(0)) {
    if (path.dirname(path.resolve(repo)) !== path.resolve(os.tmpdir()) || !path.basename(repo).startsWith('ogc-hunk-viewer-'))
      throw new Error('Unexpected test repository cleanup path.');
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe('staging completion through the live resource cache and Git', () => {
  it.each(['standalone viewer', 'repository selection'])('shows the complete index diff after staging both hunks through %s', async (entry) => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-hunk-viewer-'));
    repositories.push(repo);
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.name', 'Viewer integration');
    git(repo, 'config', 'user.email', 'viewer@example.test');
    git(repo, 'config', 'core.autocrlf', 'false');
    const lines = Array.from({ length: 60 }, (_, index) => `original line ${index + 1}`);
    fs.writeFileSync(path.join(repo, 'file.txt'), lines.join('\n') + '\n');
    git(repo, 'add', 'file.txt');
    git(repo, 'commit', '-m', 'Initial file');
    lines[1] = 'first staged change';
    lines[49] = 'last staged change';
    const working = lines.join('\n') + '\n';
    fs.writeFileSync(path.join(repo, 'file.txt'), working);

    const runner = new GitRunner();
    const files = new RepositoryFiles(
      () => repo,
      (cwd, revision, maxBytes) => runner.runBuffer(cwd, ['show', revision], { maxBytes, tooLargeMessage: 'Too large' }),
    );
    const service = new RepositoryFileViewerService(runner, files);
    // Keep the production cached client intact; stub only the IPC boundary.
    vi.mocked(gitClient.getDiffPreview).mockRestore();
    vi.mocked(gitClient.applyPatch).mockRestore();
    vi.mocked(gitClient.getRepositoryFilePreview).mockRestore();
    const api: Pick<ElectronGitAPI, 'getDiffPreview' | 'applyPatch' | 'getRepositoryFilePreview'> = {
      getDiffPreview: async (args, limits) => ({ success: true, data: await runner.getDiffPreview(repo, normalizeDiffPreviewArgs(args), limits) }),
      getRepositoryFilePreview: async (request) => ({ success: true, data: await service.getPreview(request) }),
      applyPatch: async (patch, options) => ({
        success: true,
        data: await runner.runWithInput(repo, ['apply', ...(options?.cached ? ['--cached'] : []), ...(options?.reverse ? ['--reverse'] : []), '-'], patch),
      }),
    };
    vi.spyOn(electronApi, 'requireElectronGitApi').mockReturnValue(api as ElectronGitAPI);
    const view =
      entry === 'repository selection' ? await renderRepositoryViewer(repo) : await renderViewer({ ...viewerRequest(), repoPath: repo, startView: 'diff' });
    try {
      await waitForView(() => expect(document.querySelectorAll('.diff-hunk')).toHaveLength(2));
      await click('Stage');
      await waitForView(() => expect(document.querySelectorAll('.diff-hunk')).toHaveLength(1));
      await waitForView(() => expect(button('Stage').disabled).toBe(false));
      expect(document.querySelector('.file-viewer')?.getAttribute('data-source')).toBe('unstaged');
      await click('Stage');
      await waitForView(() => expect(git(repo, 'diff', '--', 'file.txt')).toBe(''));
      await waitForView(() => expect(document.querySelector('.file-viewer')?.getAttribute('data-source')).toBe('staged'));
      if (entry === 'repository selection') expect(document.querySelector('[data-selected-source]')?.getAttribute('data-selected-source')).toBe('staged');
      expect(document.querySelectorAll('.diff-hunk')).toHaveLength(2);
      expect(document.querySelector('.diff-viewer-root')?.textContent).toContain('first staged change');
      expect(document.querySelector('.diff-viewer-root')?.textContent).toContain('last staged change');
      expect(button('Unstage')).toBeTruthy();
      await click('Text');
      await waitForView(() => expect(editor.value).toBe(working));
      expect(fs.readFileSync(path.join(repo, 'file.txt'), 'utf8')).toBe(working);
      expect(view.props.onRepoChanged).toHaveBeenCalledTimes(2);
    } finally {
      view.unmount();
    }
  });
});
