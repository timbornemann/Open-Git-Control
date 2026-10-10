// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { createLanguageTranslations } from '@/i18nCore';
import type { GraphNode } from '@/utils/graphLayout';
import { CommitGraphRows } from './CommitGraphRows';

vi.mock('@/data/commitDetails', () => ({ loadCommitOverview: vi.fn().mockResolvedValue(null) }));

const node = (stats: GraphNode['commit']['stats'] = { files: 12, additions: 437, deletions: 92 }): GraphNode => ({
  row: 0,
  lane: 0,
  color: 'var(--accent-primary)',
  isMerge: false,
  commit: {
    hash: 'a'.repeat(40),
    abbrevHash: 'aaaaaaa',
    author: 'Full author name',
    date: '2026-10-10T12:34:00Z',
    subject: 'The complete commit title that remains readable in compact history',
    parentHashes: [],
    refs: ['HEAD -> main', 'tag: v2.2.1'],
    stats,
    statsState: stats ? 'ready' : 'loading',
  },
});
let root: Root, host: HTMLDivElement;
const onSelectCommit = vi.fn(),
  onToggleBranchHighlight = vi.fn();
const render = (nodes = [node()], repoPath = '/first') =>
  act(() => {
    const props: ComponentProps<typeof CommitGraphRows> = {
      graphWidth: 60,
      workingTreeStatus: null,
      hasWorkingTreeChanges: false,
      isWorkingTreeSelected: false,
      workingTreeLabel: '',
      workingTreeCount: 0,
      workingTreeSummary: { conflicts: 0, staged: 0, unstaged: 0, untracked: 0, total: 0 },
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      visibleNodes: nodes,
      showSecondaryHistory: true,
      matchedHashSet: new Set(),
      normalizedSearch: '',
      currentPathHashes: new Set(),
      selectedPathHashes: new Set(),
      hasAnyPathHighlight: false,
      currentPathColor: '',
      selectedPathColor: '',
      branchTipByRef: new Map(),
      localBranchNames: new Set(['main']),
      conflictingTags: new Set(),
      activeHighlightedBranch: null,
      hasSelectedCommitFocus: false,
      headNode: nodes[0] ?? node(),
      reachableFromHead: new Set(nodes.map((item) => item.commit.hash)),
      hasPassiveHeadFocus: false,
      loadingMore: false,
      hasMoreCommits: false,
      onLoadMoreCommits: vi.fn(),
      onSelectCommit,
      onContextMenu: vi.fn(),
      onToggleBranchHighlight,
      onClearBranchHighlight: vi.fn(),
      formatCommitDate: () => '10 Oct',
      t: createLanguageTranslations('en').t,
    };
    root.render(
      <I18nProvider language="en">
        <CommitGraphRows key={repoPath} {...props} />
      </I18nProvider>,
    );
  });
const row = () => host.querySelector<HTMLDivElement>('.commit-row')!;
const popup = () => document.querySelector<HTMLElement>('[role="tooltip"]');
const hideMetadata = () => {
  host.querySelector<HTMLElement>('.commit-author')!.style.display = 'none';
};
const hover = (element: HTMLElement = row()) => act(() => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
const leave = (element: HTMLElement, relatedTarget: EventTarget | null = null) =>
  act(() => element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget })));
const advance = (ms = 250) => act(() => vi.advanceTimersByTime(ms));
const key = (element: HTMLElement, value: string) => act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('compact commit history details', () => {
  it('opens a delayed, unclipped tooltip only when information is hidden', () => {
    render();
    hover();
    advance();
    expect(popup()).toBeNull();
    hideMetadata();
    hover();
    advance(249);
    expect(popup()).toBeNull();
    advance(1);
    expect(popup()?.textContent).toContain(node().commit.subject);
    expect(popup()?.textContent).toContain('Full author name');
    expect(popup()?.textContent).toContain('2026');
    expect(popup()?.textContent).toContain('a'.repeat(40));
    expect(popup()?.textContent).toContain('HEAD -> main · tag: v2.2.1');
    expect(popup()?.textContent).toContain('12 files');
    expect(popup()?.textContent).toContain('+437');
    expect(popup()?.textContent).toContain('−92');
    expect(host.contains(popup())).toBe(false);
    expect(row().getAttribute('aria-describedby')).toBe(popup()?.id);
  });

  it('also reveals an ellipsized title when metadata is visible', () => {
    render();
    const subject = host.querySelector('.commit-subject')!;
    Object.defineProperties(subject, { clientWidth: { value: 100 }, scrollWidth: { value: 350 } });
    hover();
    advance();
    expect(popup()?.textContent).toContain(node().commit.subject);
  });

  it('does not show a stale tooltip when the pointer moves quickly between commits', () => {
    const other = node();
    other.commit = { ...other.commit, hash: 'b'.repeat(40), subject: 'Another commit', author: 'Another author' };
    render([node(), other]);
    const rows = [...host.querySelectorAll<HTMLDivElement>('.commit-row')];
    for (const author of host.querySelectorAll<HTMLElement>('.commit-author')) author.style.display = 'none';
    hover(rows[0]);
    advance(100);
    leave(rows[0], rows[1]);
    hover(rows[1]);
    advance();
    expect(popup()?.textContent).toContain('Another commit');
    expect(popup()?.textContent).toContain('Another author');
    expect(popup()?.textContent).not.toContain(node().commit.subject);
    expect(rows[0].getAttribute('aria-describedby')).toBeNull();
    expect(rows[1].getAttribute('aria-describedby')).toBe(popup()?.id);
  });

  it('keeps the hovered commit and refreshes its arriving statistics', () => {
    render([node(null)]);
    hideMetadata();
    hover();
    advance();
    const originalRow = row();
    expect(popup()?.textContent).toContain('Commit statistics are loading in the background.');
    expect(popup()?.textContent).not.toContain('+0');
    render([node({ files: 3, additions: 128, deletions: 17 })]);
    expect(row()).toBe(originalRow);
    expect(popup()?.textContent).toContain('3 files');
    expect(popup()?.textContent).toContain('+128');
    expect(popup()?.textContent).toContain('−17');
  });

  it('allows moving into the tooltip and dismisses it with Escape or after leaving', () => {
    render();
    hideMetadata();
    hover();
    advance();
    const details = popup()!;
    leave(row(), details);
    hover(details);
    advance();
    expect(popup()).toBe(details);
    key(details, 'Escape');
    expect(popup()).toBeNull();
    expect(row().getAttribute('aria-describedby')).toBeNull();
    hover();
    advance();
    leave(row());
    advance(150);
    expect(popup()).toBeNull();
  });

  it('supports keyboard focus and selection without intercepting branch controls', () => {
    render();
    hideMetadata();
    act(() => row().focus());
    expect(popup()).not.toBeNull();
    key(row(), 'Enter');
    expect(onSelectCommit).toHaveBeenCalledWith('a'.repeat(40));
    expect(popup()).toBeNull();
    const branch = host.querySelector<HTMLButtonElement>('.branch-toggle')!;
    act(() => branch.focus());
    expect(popup()).not.toBeNull();
    expect(branch.getAttribute('aria-describedby')).toBe(popup()?.id);
    onSelectCommit.mockClear();
    key(branch, ' ');
    act(() => branch.click());
    expect(onSelectCommit).not.toHaveBeenCalled();
    expect(onToggleBranchHighlight).toHaveBeenCalledWith('main');
  });

  it('cancels pending and visible hints on scrolling, resize and context changes', () => {
    render();
    hideMetadata();
    hover();
    act(() => host.dispatchEvent(new Event('scroll')));
    advance();
    expect(popup()).toBeNull();
    hover();
    advance();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(popup()).toBeNull();
    hover();
    advance();
    render([], '/first');
    expect(popup()).toBeNull();
    render();
    hideMetadata();
    hover();
    advance();
    render([node()], '/other');
    expect(popup()).toBeNull();
    expect(row().getAttribute('aria-describedby')).toBeNull();
  });
});
