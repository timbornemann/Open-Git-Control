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
  it.each([
    ['string', 'fatal: invalid file revision'],
    ['line', 'fatal: invalid file revision'],
    ['regex', 'fatal: invalid file revision'],
    ['regex', 'fatal: invalid regex: Unmatched ['],
  ] as const)('reports the actual %s failure: %s', async (mode, message) => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: false, error: message });
    const onError = vi.fn();
    let state: ReturnType<typeof useForensicSearch> | null = null;
    const Harness = () => {
      state = useForensicSearch({ repoPath: 'C:/repo-a', workingTreeStatus: null, onError, t: ((key: string) => key) as any });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(Harness)));
      act(() => {
        state!.setForensicType(mode);
        state!.setForensicPath('README.md');
        state!.setForensicValue('needle');
      });
      await act(async () => {
        await state!.runForensicSearch();
      });
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        message === 'fatal: invalid regex: Unmatched ['
          ? 'generated.components.commit_graph.useforensicsearch.invalid_regex_pattern_please_fix_the_expression_1ce435a7'
          : message,
      );
    } finally {
      act(() => root.unmount());
    }
  });
  it('rejects fractional line positions before issuing a Git request', async () => {
    const command = vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: '' });
    const onError = vi.fn();
    let state: ReturnType<typeof useForensicSearch> | null = null;
    const Harness = () => {
      state = useForensicSearch({ repoPath: 'C:/repo-a', workingTreeStatus: null, onError, t: ((key: string) => key) as any });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(Harness)));
      act(() => {
        state!.setForensicType('line');
        state!.setForensicPath('README.md');
        state!.setForensicStartLine('1.5');
        state!.setForensicEndLine('2');
      });
      await act(async () => {
        await state!.runForensicSearch();
      });
      expect(command).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledExactlyOnceWith('generated.components.commit_graph.useforensicsearch.invalid_line_range_please_check_start_end_295dd362');
    } finally {
      act(() => root.unmount());
    }
  });
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
  const log = ['a'.repeat(40), 'aaaaaaa', 'Alex', '2026-10-20T10:00:00Z', 'Saved change', '', ''].join('\x1f') + '\0';
  it.each(['path', 'value', 'type', 'start', 'end'] as const)('clears results when the %s search field changes', async (field) => {
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockResolvedValue({ success: true, data: log });
    let state: ReturnType<typeof useForensicSearch> | null = null;
    const Harness = () => {
      state = useForensicSearch({ repoPath: 'C:/repo-a', workingTreeStatus: null, t: ((key: string) => key) as any });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(Harness)));
      act(() => {
        state!.setForensicPath('README.md');
        state!.setForensicValue('needle');
      });
      await act(async () => {
        await state!.runForensicSearch();
      });
      expect(state!.forensicResults).toHaveLength(1);
      act(() => {
        if (field === 'path') state!.setForensicPath('src/app.ts');
        else if (field === 'value') state!.setForensicValue('another');
        else if (field === 'type') state!.setForensicType('regex');
        else if (field === 'start') state!.setForensicStartLine('2');
        else state!.setForensicEndLine('2');
      });
      expect(state!.forensicResults).toEqual([]);
      expect(state!.forensicNoMatches).toBe(false);
      expect(state!.forensicLoading).toBe(false);
    } finally {
      act(() => root.unmount());
    }
  });
  it.each(['path', 'reset'] as const)('discards a pending response after %s invalidation', async (invalidation) => {
    let resolve!: (value: { success: true; data: string }) => void;
    vi.spyOn(gitClient, 'runGitCommandForRepo').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let state: ReturnType<typeof useForensicSearch> | null = null;
    const Harness = () => {
      state = useForensicSearch({ repoPath: 'C:/repo-a', workingTreeStatus: null, t: ((key: string) => key) as any });
      return null;
    };
    const root = createRoot(document.getElementById('root')!);
    try {
      await act(async () => root.render(createElement(Harness)));
      act(() => {
        state!.setForensicPath('README.md');
        state!.setForensicValue('needle');
      });
      let request!: Promise<void>;
      act(() => {
        request = state!.runForensicSearch();
      });
      expect(state!.forensicLoading).toBe(true);
      act(() => {
        if (invalidation === 'path') state!.setForensicPath('src/app.ts');
        else state!.resetForensicState();
      });
      await act(async () => {
        resolve({ success: true, data: log });
        await request;
      });
      expect(state!.forensicResults).toEqual([]);
      expect(state!.forensicLoading).toBe(false);
    } finally {
      act(() => root.unmount());
    }
  });
});
