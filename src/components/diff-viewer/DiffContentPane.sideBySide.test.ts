import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseDiff } from '@/utils/diffParser';
import { DiffContentPane } from './DiffContentPane';

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, tr: (_de: string, en: string) => en }),
}));
vi.mock('@/hooks/useDiffSyntaxHighlighting', () => ({
  useDiffSyntaxHighlighting: () => ({ highlightLine: (value: string) => value }),
}));
vi.mock('./DiffBlameCell', () => ({ DiffBlameCell: () => null }));

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = dom.window.document.getElementById('root') as HTMLElement;
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

const renderPane = (diffText: string) => {
  const parsed = parseDiff(diffText);
  act(() => {
    root.render(
      createElement(DiffContentPane, {
        request: { source: 'unstaged', path: 'a.ts' } as never,
        viewMode: 'side-by-side',
        diffText,
        isLoading: false,
        error: null,
        parsed,
        canRenderText: true,
        isBinaryDiff: false,
        looksBinaryByExt: false,
        isTooLarge: false,
        sourceTruncated: false,
        activeHunkIndex: 0,
        setHunkRef: () => {},
        scrollToHunk: () => {},
        hunkOpError: null,
        isHunkOperationRunning: false,
        applyHunk: () => {},
        showBlame: false,
        isBlameLoading: false,
        blameMap: new Map(),
      }),
    );
  });
};

describe('DiffContentPane side-by-side modified-line highlighting', () => {
  it('renders a modified line with deletion/addition backgrounds, not transparent context', () => {
    renderPane(['@@ -1,2 +1,2 @@', ' keep', '-old line', '+new line'].join('\n'));

    const delCells = container.querySelectorAll('.diff-sbs-cell.del');
    const addCells = container.querySelectorAll('.diff-sbs-cell.add');
    const ctxCells = container.querySelectorAll('.diff-sbs-cell.ctx');

    // The modified line contributes one del (left) and one add (right) cell.
    expect(delCells).toHaveLength(1);
    expect(addCells).toHaveLength(1);
    expect(delCells[0]?.textContent).toContain('old line');
    expect(addCells[0]?.textContent).toContain('new line');

    // The unchanged "keep" line stays transparent context on both sides.
    expect(ctxCells).toHaveLength(2);
    ctxCells.forEach((cell) => expect(cell.textContent).toContain('keep'));
  });

  it('keeps genuinely unchanged lines as context on both sides', () => {
    renderPane(['@@ -1,2 +1,2 @@', ' alpha', ' beta'].join('\n'));

    expect(container.querySelectorAll('.diff-sbs-cell.del')).toHaveLength(0);
    expect(container.querySelectorAll('.diff-sbs-cell.add')).toHaveLength(0);
    expect(container.querySelectorAll('.diff-sbs-cell.ctx')).toHaveLength(4);
  });
});
