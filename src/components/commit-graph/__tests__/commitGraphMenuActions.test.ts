import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommitContextMenu } from '../CommitContextMenu';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildCommitMenuActions } from '@/components/commit-graph/commitGraphMenuActions';
import { trByLanguage, translateFromCatalog, type AppLanguage } from '@/i18nCore';
import type { GraphNode } from '@/utils/graphLayout';
import { gitClient } from '@/services/gitClient';

afterEach(() => vi.restoreAllMocks());

const HASH = 'a'.repeat(40);
const PARENT_HASH = 'b'.repeat(40);

const node: GraphNode = {
  commit: {
    hash: HASH,
    abbrevHash: HASH.slice(0, 8),
    author: 'Test Author',
    date: '2026-01-01T00:00:00.000Z',
    subject: 'Test commit',
    parentHashes: [PARENT_HASH],
    refs: ['HEAD -> main', 'feature', 'origin/remote-only'],
    stats: null,
    statsState: 'missing',
  },
  row: 0,
  lane: 0,
  color: '#fff',
  isMerge: false,
};

const buildActions = (
  language: AppLanguage,
  targetNode: GraphNode = node,
  branches = [
    { name: 'main', isHead: true, scope: 'local' as const },
    { name: 'feature', isHead: false, scope: 'local' as const },
  ],
) => {
  let confirmDialog: ConfirmDialogState | null = null;
  let inputDialog: InputDialogState | null = null;
  const runGitAction = vi.fn();
  const setToast = vi.fn();
  const editMessage = vi.fn();
  const refreshCommits = vi.fn();
  const refreshWorkingTreeStatus = vi.fn();
  const actions = buildCommitMenuActions({
    repoPath: 'C:/repo',
    node: targetNode,
    branches,
    currentBranch: 'main',
    layout: { nodes: [targetNode], edges: [], maxLane: 0 },
    reachableFromHead: new Set([HASH]),
    runGitAction,
    setConfirmDialog: (value) => {
      confirmDialog = value;
    },
    setInputDialog: (value) => {
      inputDialog = value;
    },
    setToast,
    refreshCommits,
    refreshWorkingTreeStatus,
    onEditCommitMessage: editMessage,
    t: (key, variables) => translateFromCatalog(language, key, variables),
    tr: (deText, enText) => trByLanguage(language, deText, enText),
  });

  return {
    actions,
    runGitAction,
    setToast,
    editMessage,
    refreshCommits,
    refreshWorkingTreeStatus,
    getConfirmDialog: () => confirmDialog,
    getInputDialog: () => inputDialog,
  };
};

describe('commit graph menu localization', () => {
  it.each((['de', 'en'] as const).flatMap((language) => (['root', 'off-head', 'merge'] as const).map((reason) => ({ language, reason }))))(
    'refuses $reason rebase before opening an editor or calling Git in $language',
    ({ language, reason }) => {
      const selected = {
        ...node,
        isMerge: reason === 'merge',
        commit: {
          ...node.commit,
          hash: reason === 'off-head' ? 'c'.repeat(40) : HASH,
          parentHashes: reason === 'root' ? [] : reason === 'merge' ? [PARENT_HASH, 'd'.repeat(40)] : [PARENT_HASH],
        },
      };
      const start = vi.spyOn(gitClient, 'startInteractiveRebase');
      const result = buildActions(language, selected);
      result.actions.find((action) => action.icon === 'IR')!.action();
      expect(result.getInputDialog()).toBeNull();
      expect(start).not.toHaveBeenCalled();
      expect(result.refreshCommits).not.toHaveBeenCalled();
      expect(result.refreshWorkingTreeStatus).not.toHaveBeenCalled();
      const messages = {
        root: ['Root-Commit kann nicht interaktiv gerebased werden.', 'The root commit cannot be interactively rebased.'],
        'off-head': ['Commit liegt nicht auf dem aktuellen HEAD-Pfad.', 'The commit is not on the current HEAD path.'],
        merge: ['Interaktiver Rebase mit Merge-Commits wird hier nicht unterstuetzt.', 'Interactive rebases containing merge commits are not supported here.'],
      };
      expect(result.setToast).toHaveBeenCalledExactlyOnceWith({ msg: messages[reason][language === 'de' ? 0 : 1], isError: true });
    },
  );
  it.each([true, false])('reloads the real post-rebase state even when the command success is %s', async (success) => {
    vi.spyOn(gitClient, 'isAvailable').mockReturnValue(true);
    const start = vi
      .spyOn(gitClient, 'startInteractiveRebase')
      .mockResolvedValue(
        success ? { success: true, data: 'Paused for editing.' } : { success: false, error: 'CONFLICT (content): Merge conflict in README.md' },
      );
    const result = buildActions('en');
    result.actions.find((action) => action.icon === 'IR')!.action();
    await result.getInputDialog()!.onSubmit({ todo: 'pick ' + HASH + ' Test commit' });
    expect(start).toHaveBeenCalledExactlyOnceWith(PARENT_HASH, ['pick ' + HASH + ' Test commit'], 'C:/repo');
    expect(result.refreshCommits).toHaveBeenCalledExactlyOnceWith();
    expect(result.refreshWorkingTreeStatus).toHaveBeenCalledExactlyOnceWith();
    expect(result.setToast).toHaveBeenCalledWith(expect.objectContaining({ isError: !success }));
  });
  it('renders the message editor as an actionable menu entry after its separator', () => {
    const { actions } = buildActions('en');
    const markup = renderToStaticMarkup(
      createElement(CommitContextMenu, {
        contextMenu: { x: 0, y: 0, node },
        contextMenuRef: { current: null },
        contextMenuPlacement: { left: 0, top: 0, maxHeight: 500, ready: true },
        menuActions: actions,
        mergeContextPayload: null,
        canMergeBranches: false,
        mergeCtxExpanded: false,
        onToggleMergeExpanded: vi.fn(),
        onClose: vi.fn(),
        onRunMenuAction: vi.fn(),
        onMergeCommit: vi.fn(),
        onMergeBranchRef: vi.fn(),
        t: (key, variables) => translateFromCatalog('en', key, variables),
        tr: (de, en) => en || de,
      }),
    );
    expect(markup).toContain('Edit commit message …');
  });
  it('opens the asynchronous message editor for the selected full hash', () => {
    const result = buildActions('de');
    result.actions.find((action) => action.label === 'Commit-Nachricht bearbeiten …')?.action();
    expect(result.editMessage).toHaveBeenCalledExactlyOnceWith(HASH);
    expect(result.runGitAction).not.toHaveBeenCalled();
    expect(result.getInputDialog()).toBeNull();
  });
  it('uses English for menu items, success messages and all destructive dialogs', () => {
    const result = buildActions('en');
    const labels = result.actions.map((action) => action.label);

    expect(labels).toContain('Check out branch: feature');
    expect(labels).toContain(`Create new branch from ${HASH.slice(0, 8)}...`);
    expect(labels).toContain('Check out commit only (detached HEAD)...');
    expect(labels).toContain('Create new branch...');
    expect(labels).toContain('Create tag...');
    expect(labels).toContain(`Reset --hard to ${HASH.slice(0, 8)}`);
    expect(labels).toContain(`Interactive rebase through ${HASH.slice(0, 8)}`);
    expect(labels).toContain('Copy commit hash');

    result.actions.find((action) => action.icon === 'CP')?.action();
    expect(result.runGitAction.mock.calls[0]?.[1]).toBe(`Successfully cherry-picked ${HASH.slice(0, 8)}.`);

    result.actions.find((action) => action.icon === 'RH')?.action();
    expect(result.getConfirmDialog()).toMatchObject({
      title: 'Perform hard reset?',
      message: 'HEAD, the index, and the working tree will be reset to this commit.',
      consequences: 'Uncommitted local changes will be lost.',
      confirmLabel: 'Hard reset',
    });

    result.actions.find((action) => action.icon === 'IR')?.action();
    expect(result.getInputDialog()).toMatchObject({
      title: 'Start interactive rebase',
      confirmLabel: 'Start rebase',
      fields: [{ label: 'Rebase todo' }],
    });

    result.actions.find((action) => action.icon === '!')?.action();
    expect(result.getConfirmDialog()).toMatchObject({ title: 'Enter detached HEAD state?', confirmLabel: 'Check out anyway' });

    result.actions.find((action) => action.icon === 'B')?.action();
    expect(result.getInputDialog()).toMatchObject({ title: 'Create new branch', confirmLabel: 'Create branch' });

    result.actions.find((action) => action.icon === 'T')?.action();
    expect(result.getInputDialog()).toMatchObject({ title: 'Create tag on commit', confirmLabel: 'Create tag' });
  });

  it('continues to use German when German is selected', () => {
    const result = buildActions('de');
    const labels = result.actions.map((action) => action.label);

    expect(labels).toContain('Branch auschecken: feature');
    expect(labels).toContain(`Neuen Branch von ${HASH.slice(0, 8)} erstellen...`);
    expect(labels).toContain(`Reset --hard auf ${HASH.slice(0, 8)}`);
    expect(labels).toContain(`Interaktiver Rebase bis ${HASH.slice(0, 8)}`);

    result.actions.find((action) => action.icon === 'RH')?.action();
    expect(result.getConfirmDialog()).toMatchObject({
      title: 'Hard Reset ausfuehren?',
      consequences: 'Lokale nicht-gesicherte Aenderungen gehen verloren.',
    });
  });

  it('offers only the mainline-aware revert for merge commits', () => {
    const mergeNode: GraphNode = {
      ...node,
      isMerge: true,
      commit: { ...node.commit, parentHashes: [PARENT_HASH, 'c'.repeat(40)] },
    };
    const result = buildActions('en', mergeNode);
    expect(result.actions.some((action) => action.icon === 'RV')).toBe(false);
    expect(result.actions.filter((action) => action.icon === 'MR')).toHaveLength(1);
  });

  it('checks out slash-containing local branches as local refs', () => {
    const localSlashNode: GraphNode = { ...node, commit: { ...node.commit, refs: ['HEAD -> main', 'feature/nested'] } };
    const result = buildActions('en', localSlashNode, [
      { name: 'main', isHead: true, scope: 'local' },
      { name: 'feature/nested', isHead: false, scope: 'local' },
    ]);
    result.actions.find((action) => action.label === 'Check out branch: feature/nested')?.action();
    expect(result.runGitAction).toHaveBeenCalledWith(['checkout', 'feature/nested'], 'Checked out branch "feature/nested".');
  });
});
