// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLanguageTranslations } from '@/i18nCore';
import type { GraphNode } from '@/utils/graphLayout';
import { CommitContextMenu } from './CommitContextMenu';
let root: Root, host: HTMLDivElement, trigger: HTMLButtonElement;
const close = vi.fn(),
  run = vi.fn();
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  close.mockReset();
  run.mockReset();
  host = document.createElement('div');
  trigger = document.createElement('button');
  document.body.append(trigger, host);
  trigger.focus();
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  trigger.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(() =>
    root.render(
      <CommitContextMenu
        contextMenu={{ x: 20, y: 40, node: { commit: { hash: 'a'.repeat(40), abbrevHash: 'aaaaaaa', subject: 'A commit' } } as GraphNode }}
        contextMenuRef={{ current: null }}
        contextMenuPlacement={{ left: 20, top: 40, maxHeight: 500, ready: true }}
        menuActions={[
          { label: 'First', icon: '1', action: vi.fn() },
          { label: '', icon: '', separator: true, action: vi.fn() },
          { label: 'Edit message', icon: '2', action: vi.fn() },
        ]}
        mergeContextPayload={null}
        canMergeBranches={false}
        mergeCtxExpanded={false}
        onToggleMergeExpanded={vi.fn()}
        onClose={close}
        onRunMenuAction={run}
        onMergeCommit={vi.fn()}
        onMergeBranchRef={vi.fn()}
        t={createLanguageTranslations('en').t}
        tr={(_de, en) => en}
      />,
    ),
  );
const key = (value: string) => act(() => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })));
it('focuses its first action, wraps arrows, skips separators and restores the trigger', () => {
  render();
  const buttons = host.querySelectorAll('button');
  expect(document.activeElement).toBe(buttons[0]);
  key('End');
  expect(document.activeElement).toBe(buttons[1]);
  key('ArrowDown');
  expect(document.activeElement).toBe(buttons[0]);
  key('ArrowUp');
  expect(document.activeElement).toBe(buttons[1]);
  key('Home');
  expect(document.activeElement).toBe(buttons[0]);
  act(() => root.render(null));
  expect(document.activeElement).toBe(trigger);
});
it('closes with Escape and exposes actions as menu items', () => {
  render();
  expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
  key('Escape');
  expect(close).toHaveBeenCalledOnce();
  expect(run).not.toHaveBeenCalled();
});
