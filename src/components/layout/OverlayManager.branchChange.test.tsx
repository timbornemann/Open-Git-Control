// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n';
import { OverlayManager } from './OverlayManager';
import { useBranchChangeDialogState } from '@/components/branch-change/branchChangeDialogState';

vi.mock('@/components/git-identity/GitIdentityDialog', () => ({ GitIdentityDialog: () => null }));
vi.mock('@/components/CommandPalette', () => ({ CommandPalette: () => null }));
vi.mock('./GitTransferProgressNotification', () => ({ GitTransferProgressNotification: () => null }));
vi.mock('./CloneProgressModal', () => ({ CloneProgressModal: () => null }));
vi.mock('./BranchContextMenu', () => ({ BranchContextMenu: () => null }));
it('hides the branch-name input during guided switching and restores its unsaved draft', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const inputDialog = {
    title: 'New branch',
    message: '',
    fields: [{ id: 'name', label: 'Name', defaultValue: 'feature' }],
    contextItems: [],
    irreversible: false,
    consequences: '',
    onSubmit: vi.fn(),
  };
  const props = {
    repoSwitcher: { selectedIndex: null, openRepos: [], activeRepo: '/repo', listRef: createRef<HTMLDivElement>() },
    toasts: { items: [], onDismiss: vi.fn() },
    branchMenu: { menu: null, setMenu: vi.fn(), onCheckout: vi.fn(), onMerge: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() },
    dialogs: {
      inputDialog,
      confirmDialog: null,
      onConfirm: vi.fn(),
      onSecondaryConfirm: vi.fn(),
      onCancelConfirm: vi.fn(),
      onSubmitInput: vi.fn(),
      onCancelInput: vi.fn(),
    },
    gitTransfer: { open: false, title: null, events: [] },
    cloneProgress: { isCloning: false, cloneRepoName: null, cloneFinished: false, cloneError: null, cloneLog: [], onClose: vi.fn() },
    commandPalette: { open: false, commands: [], onClose: vi.fn() },
  };
  try {
    await act(async () => root.render(createElement(I18nProvider, { language: 'en', children: createElement(OverlayManager, props) })));
    const field = host.querySelector<HTMLInputElement>('input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, 'my-unsaved-branch');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(field.value).toBe('my-unsaved-branch');
    act(() =>
      useBranchChangeDialogState
        .getState()
        .set({ id: 'branch-change', repoPath: '/repo', preparation: 'inspect', prepare: false, finish: vi.fn(), cancel: vi.fn(), retry: vi.fn() }),
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => useBranchChangeDialogState.getState().set(null));
    expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('my-unsaved-branch');
    expect(props.dialogs.onCancelInput).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    useBranchChangeDialogState.getState().set(null);
  }
});
