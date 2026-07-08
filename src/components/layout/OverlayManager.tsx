import React from 'react';
import type { GitJobEventDto } from '../../global';
import { useI18n } from '../../i18n';
import type { GitMergeMode } from '../../types/git';
import { ActionToastViewport, type ActionToastItem } from '../ActionToastViewport';
import { CommandPalette, type PaletteCommand } from '../CommandPalette';
import { Confirm } from '../Confirm';
import { DangerConfirm } from '../DangerConfirm';
import { Input } from '../Input';
import { BranchContextMenu } from './BranchContextMenu';
import { CloneProgressModal } from './CloneProgressModal';
import { GitTransferProgressOverlay } from './GitTransferProgressOverlay';
import type { BranchContextMenuState, ConfirmDialogState, InputDialogState } from './layoutTypes';

type RepoSwitcherOverlayState = {
  selectedIndex: number | null;
  listRef: React.RefObject<HTMLDivElement>;
  openRepos: string[];
  activeRepo: string | null;
};

type ToastOverlayState = {
  items: ActionToastItem[];
  onDismiss: (id: number) => void;
};

type BranchMenuOverlayState = {
  menu: BranchContextMenuState;
  setMenu: (value: BranchContextMenuState) => void;
  onCheckout: (branch: string) => void;
  onMerge: (branch: string, mode: GitMergeMode) => void;
  onRename: (branch: string) => void;
  onDelete: (branch: string) => void;
};

type DialogOverlayState = {
  confirmDialog: ConfirmDialogState | null;
  inputDialog: InputDialogState | null;
  onConfirm: () => Promise<void>;
  onSecondaryConfirm: () => Promise<void>;
  onCancelConfirm: () => void;
  onSubmitInput: (values: Record<string, string>) => Promise<void>;
  onCancelInput: () => void;
};

type GitTransferOverlayState = {
  open: boolean;
  title: string | null;
  events: GitJobEventDto[];
};

type CloneProgressOverlayState = {
  isCloning: boolean;
  cloneRepoName: string | null;
  cloneFinished: boolean;
  cloneError: string | null;
  cloneLog: string[];
  onClose: () => void;
};

type CommandPaletteOverlayState = {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
};

type OverlayManagerProps = {
  repoSwitcher: RepoSwitcherOverlayState;
  toasts: ToastOverlayState;
  branchMenu: BranchMenuOverlayState;
  dialogs: DialogOverlayState;
  gitTransfer: GitTransferOverlayState;
  cloneProgress: CloneProgressOverlayState;
  commandPalette: CommandPaletteOverlayState;
};

const getRepoDisplayName = (repoPath: string) => repoPath.split(/[\\/]/).filter(Boolean).pop() || repoPath;

const RepoSwitcherOverlay: React.FC<{ state: RepoSwitcherOverlayState }> = ({ state }) => {
  const { t } = useI18n();

  if (state.selectedIndex === null || state.openRepos.length === 0) return null;

  return (
    <div className="repo-switcher-backdrop">
      <div className="repo-switcher-modal" role="dialog" aria-label={t('generated.app.switch_repository_84935354')}>
        <div className="repo-switcher-title">{t('generated.app.switch_repository_84935354')}</div>
        <div
          ref={state.listRef}
          className="repo-switcher-list"
          role="listbox"
          aria-activedescendant={`repo-switcher-item-${state.selectedIndex}`}
        >
          {state.openRepos.map((repoPath, index) => {
            const isSelected = index === state.selectedIndex;
            const isActive = repoPath === state.activeRepo;

            return (
              <div
                key={repoPath}
                id={`repo-switcher-item-${index}`}
                className={`repo-switcher-item${isSelected ? ' selected' : ''}`}
                role="option"
                aria-selected={isSelected}
              >
                <div className="repo-switcher-copy">
                  <span className="repo-switcher-name">{getRepoDisplayName(repoPath)}</span>
                  <span className="repo-switcher-path">{repoPath}</span>
                </div>
                {isActive && <span className="repo-switcher-active">{t('generated.app.active_28dac35a')}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const DialogOverlays: React.FC<{ state: DialogOverlayState }> = ({ state }) => (
  <>
    {state.confirmDialog?.variant === 'confirm' && (
      <Confirm
        open={true}
        title={state.confirmDialog.title}
        message={state.confirmDialog.message}
        contextItems={state.confirmDialog.contextItems}
        irreversible={state.confirmDialog.irreversible}
        consequences={state.confirmDialog.consequences}
        confirmLabel={state.confirmDialog.confirmLabel}
        onConfirm={state.onConfirm}
        secondaryActionLabel={state.confirmDialog.secondaryActionLabel}
        secondaryActionVariant={state.confirmDialog.secondaryActionVariant}
        onSecondaryAction={state.confirmDialog.onSecondaryAction
          ? state.onSecondaryConfirm
          : undefined}
        onCancel={state.onCancelConfirm}
      />
    )}

    {state.confirmDialog?.variant === 'danger' && (
      <DangerConfirm
        open={true}
        title={state.confirmDialog.title}
        message={state.confirmDialog.message}
        contextItems={state.confirmDialog.contextItems}
        irreversible={state.confirmDialog.irreversible}
        consequences={state.confirmDialog.consequences}
        confirmLabel={state.confirmDialog.confirmLabel}
        onConfirm={state.onConfirm}
        secondaryActionLabel={state.confirmDialog.secondaryActionLabel}
        secondaryActionVariant={state.confirmDialog.secondaryActionVariant}
        onSecondaryAction={state.confirmDialog.onSecondaryAction
          ? state.onSecondaryConfirm
          : undefined}
        onCancel={state.onCancelConfirm}
      />
    )}

    {state.inputDialog && (
      <Input
        open={true}
        title={state.inputDialog.title}
        message={state.inputDialog.message}
        fields={state.inputDialog.fields}
        contextItems={state.inputDialog.contextItems}
        irreversible={state.inputDialog.irreversible}
        consequences={state.inputDialog.consequences}
        confirmLabel={state.inputDialog.confirmLabel}
        onSubmit={state.onSubmitInput}
        onCancel={state.onCancelInput}
      />
    )}
  </>
);

export const OverlayManager: React.FC<OverlayManagerProps> = ({
  repoSwitcher,
  toasts,
  branchMenu,
  dialogs,
  gitTransfer,
  cloneProgress,
  commandPalette,
}) => (
  <>
    <RepoSwitcherOverlay state={repoSwitcher} />

    <ActionToastViewport
      toasts={toasts.items}
      onDismiss={toasts.onDismiss}
    />

    <BranchContextMenu
      branchContextMenu={branchMenu.menu}
      setBranchContextMenu={branchMenu.setMenu}
      onCheckout={branchMenu.onCheckout}
      onMerge={branchMenu.onMerge}
      onRename={branchMenu.onRename}
      onDelete={branchMenu.onDelete}
    />

    <DialogOverlays state={dialogs} />

    <GitTransferProgressOverlay
      open={gitTransfer.open}
      title={gitTransfer.title}
      events={gitTransfer.events}
    />

    <CloneProgressModal
      isCloning={cloneProgress.isCloning}
      cloneRepoName={cloneProgress.cloneRepoName}
      cloneFinished={cloneProgress.cloneFinished}
      cloneError={cloneProgress.cloneError}
      cloneLog={cloneProgress.cloneLog}
      onClose={cloneProgress.onClose}
    />

    <CommandPalette
      open={commandPalette.open}
      commands={commandPalette.commands}
      onClose={commandPalette.onClose}
    />
  </>
);
