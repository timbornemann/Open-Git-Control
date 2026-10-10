// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { FileTimelineView } from '../FileTimelineView';
import { clearTimelineSessions } from './fileTimelineSession';
import type { FileTimelineCommit, FileTimelineNode } from './types';
const mocks = vi.hoisted(() => ({ canvas: vi.fn() }));
const paths = (node: FileTimelineNode): string[] => (node.type === 'file' ? [node.path] : [...node.children!.values()].flatMap(paths));
vi.mock('../FileTimelineCanvas', () => ({
  FileTimelineCanvas: (props: { fileTree: FileTimelineNode; activeCommit: FileTimelineCommit }) => {
    mocks.canvas(props);
    return (
      <div className="timeline-test-map" data-commit={props.activeCommit.hash}>
        {paths(props.fileTree).join(',')}
      </div>
    );
  },
}));
const commits: FileTimelineCommit[] = [
  {
    hash: 'a'.repeat(40),
    author: 'Alice',
    date: '2026-10-01',
    subject: 'first',
    baselineFiles: ['existing.ts'],
    changes: [{ status: 'added', path: 'src/a.ts' }],
  },
  { hash: 'b'.repeat(40), author: 'Bob', date: '2026-10-02', subject: 'second', changes: [{ status: 'renamed', oldPath: 'src/a.ts', path: 'src/b.ts' }] },
  { hash: 'c'.repeat(40), author: 'Alice', date: '2026-10-03', subject: 'third', changes: [{ status: 'modified', path: 'existing.ts' }] },
];
let host: HTMLDivElement, root: Root;
const render = (data = commits, visibleCommitHashes?: ReadonlySet<string>) =>
  act(async () =>
    root.render(
      <I18nProvider language="en">
        <FileTimelineView commits={data} contextKey="timeline-view-test" visibleCommitHashes={visibleCommitHashes} />
      </I18nProvider>,
    ),
  );
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearTimelineSessions();
  mocks.canvas.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe('timeline playback selection', () => {
  it('shows filtered commits with the complete tree including changes made in skipped commits', async () => {
    await render(commits, new Set([commits[2].hash]));
    expect(host.querySelector('.file-timeline-position')?.textContent).toBe('Commit 1 / 1');
    expect(host.querySelector('.timeline-test-map')?.textContent).toBe('existing.ts,src/b.ts');
    expect(host.querySelector('.timeline-test-map')?.textContent).not.toContain('src/a.ts');
  });
  it('preserves the chosen commit when history advances and after reopening the report', async () => {
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="First commit"]')!.click());
    const map = host.querySelector('.timeline-test-map');
    const updated = [...commits, { ...commits[2], hash: 'd'.repeat(40), subject: 'new commit' }];
    await render(updated);
    expect(host.querySelector('.timeline-test-map')).toBe(map);
    expect(map?.getAttribute('data-commit')).toBe(commits[0].hash);
    expect(host.querySelector('.file-timeline-position')?.textContent).toBe('Commit 1 / 4');
    await act(async () => root.render(null));
    await render(updated);
    expect(host.querySelector('.timeline-test-map')?.getAttribute('data-commit')).toBe(commits[0].hash);
  });
});
