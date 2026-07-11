import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useForensicSearch } from '@/components/commit-graph/useForensicSearch';
import { gitClient } from '@/services/gitClient';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://local.test' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('localStorage', dom.window.localStorage);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useForensicSearch repository binding', () => {
  it('runs the search against the repository captured by the inspector', async () => {
    const runForRepo = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    const unscopedRun = vi.spyOn(gitClient, 'runGitCommand');
    let state: ReturnType<typeof useForensicSearch> | null = null;
    const Harness = () => {
      state = useForensicSearch({ repoPath: 'C:/repo-a', workingTreeStatus: null, t: ((key: string) => key) as any });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(createElement(Harness)));
    act(() => {
      state?.setForensicPath('src/app.ts');
      state?.setForensicValue('needle');
    });

    await act(async () => {
      await state?.runForensicSearch();
    });

    expect(runForRepo).toHaveBeenCalledWith('C:/repo-a', 'forensicHistory', 'string', 'src/app.ts', 'needle', '0', '0', '200');
    expect(unscopedRun).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
