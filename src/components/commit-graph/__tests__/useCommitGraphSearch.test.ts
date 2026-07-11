import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphLayout, GraphNode } from '@/utils/graphLayout';
import { useCommitGraphSearch } from '../useCommitGraphSearch';

const graphNode = (hash: string, row: number): GraphNode => ({
  commit: {
    hash,
    abbrevHash: hash.slice(0, 8),
    author: 'Author',
    date: '2026-01-01',
    subject: `matching ${row}`,
    parentHashes: [],
    refs: [],
    stats: null,
    statsState: 'missing',
  },
  row,
  lane: 0,
  color: '#fff',
  isMerge: false,
});

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCommitGraphSearch', () => {
  it('reveals matches through the virtual viewport instead of querying an unmounted row', () => {
    const nodes = [graphNode('a'.repeat(40), 0), graphNode('b'.repeat(40), 2500)];
    const layout: GraphLayout = { nodes, edges: [], maxLane: 0 };
    const revealCommit = vi.fn();
    let current: ReturnType<typeof useCommitGraphSearch> | null = null;
    const root = createRoot(document.getElementById('root')!);
    const Harness = () => {
      current = useCommitGraphSearch({ layout, revealCommit, t: (key) => key });
      return null;
    };
    act(() => root.render(createElement(Harness)));
    act(() => current!.setSearchQuery('matching'));
    act(() => current!.jumpToMatch(1));

    expect(revealCommit).toHaveBeenCalledWith('b'.repeat(40));
    act(() => root.unmount());
  });
});
