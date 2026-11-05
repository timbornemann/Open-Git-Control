// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useConflictNavigation } from './useConflictNavigation';
import { parseConflictEntries } from './utils';
import { parseGitStatusDetailed } from '@/utils/gitParsing';

let root: Root, host: HTMLDivElement;
const open = vi.fn();
function Harness({ path, locked = false }: { path: string; locked?: boolean }) {
  const raw = 'UD LICENSE\nUU README.md\n';
  const content = 'A modified file without text conflict markers\n';
  const navigation = useConflictNavigation({
    status: { ...parseGitStatusDetailed(raw), conflicts: parseConflictEntries(raw) },
    conflictEditor: { filePath: path, content, originalContent: content, lineEnding: '\n', isSaving: false },
    conflictBlocks: [],
    selectedConflictBlock: null,
    selectedConflictBlockIndex: 0,
    setSelectedConflictBlockIndex: vi.fn(),
    isStructuredConflictViewLocked: locked,
    conflictManualScrollRef: useRef<HTMLDivElement>(null),
    openConflictEditor: open,
  });
  return (
    <>
      <button className="previous" disabled={!navigation.hasPreviousConflictTarget} onClick={navigation.navigateToPreviousConflict}>
        Previous
      </button>
      <button className="next" disabled={!navigation.hasNextConflictTarget} onClick={navigation.navigateToNextConflict}>
        Next
      </button>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  open.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it.each([
  { path: 'LICENSE', button: 'next', nextPath: 'README.md', block: 0 },
  { path: 'README.md', button: 'previous', nextPath: 'LICENSE', block: Number.MAX_SAFE_INTEGER },
])('navigates $button from $path even when a modify/delete conflict has no text blocks', async ({ path, button, nextPath, block }) => {
  act(() => root.render(<Harness path={path} />));
  const control = host.querySelector<HTMLButtonElement>('.' + button)!;
  expect(control.disabled).toBe(false);
  await act(async () => control.click());
  expect(open).toHaveBeenCalledWith(nextPath, block);
});
it('keeps navigation disabled when malformed marker editing locks the structured view', () => {
  act(() => root.render(<Harness path="LICENSE" locked />));
  for (const button of host.querySelectorAll('button')) expect(button.disabled).toBe(true);
});
it('does not offer navigation beyond the available files', () => {
  act(() => root.render(<Harness path="LICENSE" />));
  expect(host.querySelector<HTMLButtonElement>('.previous')!.disabled).toBe(true);
  act(() => root.render(<Harness path="README.md" />));
  expect(host.querySelector<HTMLButtonElement>('.next')!.disabled).toBe(true);
});
