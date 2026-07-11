import { describe, expect, it, vi } from 'vitest';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildCommitMenuActions } from '@/components/commit-graph/commitGraphMenuActions';
import { trByLanguage, translateFromCatalog, type AppLanguage } from '@/i18n';
import type { GraphNode } from '@/utils/graphLayout';

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
  const actions = buildCommitMenuActions({
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
    refreshCommits: vi.fn(),
    refreshWorkingTreeStatus: vi.fn(),
    t: (key, variables) => translateFromCatalog(language, key, variables),
    tr: (deText, enText) => trByLanguage(language, deText, enText),
  });

  return {
    actions,
    runGitAction,
    setToast,
    getConfirmDialog: () => confirmDialog,
    getInputDialog: () => inputDialog,
  };
};

describe('commit graph menu localization', () => {
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
