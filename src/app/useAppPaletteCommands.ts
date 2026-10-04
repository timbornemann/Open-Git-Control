import { useMemo } from 'react';
import type { PaletteCommand } from '@/components/CommandPalette';
import type { useAppState } from '@/components/layout/useAppState';
import { buildCherryPickAbortDialog, buildMergeAbortDialog, buildRebaseAbortDialog } from '@/components/staging-area/conflictAbortDialogs';
import type { TranslationVariables } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { requestRemoteTransfer } from '@/components/hosting/remoteTransferDialogState';
import { useHostingState } from '@/components/hosting/hostingState';

type AppState = ReturnType<typeof useAppState>;
type Translate = (key: string, variables?: TranslationVariables) => string;

type Params = {
  state: AppState;
  t: Translate;
};

export const useAppPaletteCommands = ({ state, t }: Params): PaletteCommand[] =>
  useMemo(
    () => [
      {
        id: 'tab-repos',
        label: t('generated.app.local_repos_c90bebd3'),
        keywords: ['local', 'repos', 'lokal'],
        action: () => state.setActiveTab('localRepos'),
      },
      {
        id: 'tab-repo',
        label: t('generated.app.repository_view_400eb999'),
        keywords: ['repo', 'branch', 'commits'],
        action: () => state.setActiveTab('repo'),
      },
      {
        id: 'tab-planner',
        label: t('generated.components.layout.main.maintopbar.project_planning_71556778'),
        keywords: ['todo', 'ideas', 'bugs', 'features', 'planung'],
        action: () => state.setActiveTab('planner'),
      },
      {
        id: 'tab-hosting',
        label: 'Hosting',
        keywords: ['github', 'forgejo', 'gitlab', 'bitbucket', 'hosting', 'pr', 'mr', 'pipelines'],
        action: () => state.setActiveTab('hosting'),
      },
      {
        id: 'tab-settings',
        label: t('generated.components.layout.main.mainprimarypane.settings_c6256784'),
        keywords: ['settings', 'preferences'],
        action: () => state.setActiveTab('settings'),
      },
      {
        id: 'remote-configuration',
        label: state.settings.language === 'en' ? 'Remote configuration' : 'Remote-Konfiguration',
        keywords: ['remote', 'configuration', 'push', 'pull', 'fetch', 'konfiguration'],
        action: () => {
          if (!state.activeRepo) return;
          state.setActiveTab('repo');
          state.onOpenRemoteConfig();
        },
      },
      {
        id: 'fetch',
        label: t('generated.app.fetch_refresh_remote_88270faa'),
        keywords: ['fetch', 'remote', 'sync'],
        action: () => {
          if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'fetch' });
        },
      },
      {
        id: 'pull',
        label: t('generated.app.pull_8c55fb85'),
        keywords: ['pull', 'download'],
        action: () => {
          if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'pull' });
        },
      },
      {
        id: 'pull-rebase',
        label: t('generated.app.pull_rebase_5d462c6a'),
        keywords: ['pull', 'rebase'],
        action: () => {
          if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'pull', pullMode: 'rebase' });
        },
      },
      {
        id: 'push',
        label: t('generated.app.push_61ad6264'),
        keywords: ['push', 'upload'],
        action: () => {
          if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'push' });
        },
      },
      {
        id: 'push-force',
        label: t('generated.app.push_force_with_lease_f7c67bfe'),
        keywords: ['push', 'force'],
        action: () => {
          if (state.activeRepo) requestRemoteTransfer({ repoPath: state.activeRepo, mode: 'push', force: true });
        },
      },
      {
        id: 'branch-create',
        label: t('generated.app.create_branch_d8083e45'),
        keywords: ['branch', 'new', 'erstellen'],
        action: () => {
          state.setActiveTab('repo');
          state.setIsCreatingBranch(true);
        },
      },
      {
        id: 'stash-push',
        label: t('generated.components.staging_area.usefileoperations.create_stash_ebe60340'),
        keywords: ['stash', 'save', 'speichern'],
        action: () => state.runGitCommand(gitClient.buildStashPushArgs('Quick stash', { includeUntracked: false }), t('generated.app.stash_created_56116f06')),
      },
      {
        id: 'stash-pop',
        label: t('generated.app.apply_last_stash_pop_120593db'),
        keywords: ['stash', 'pop', 'apply', 'anwenden'],
        action: () => state.runGitCommand(gitClient.buildStashPopArgs(), t('generated.app.stash_applied_4b30902e')),
      },
      {
        id: 'merge-abort',
        label: t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66'),
        keywords: ['merge', 'abort', 'abbrechen'],
        action: () =>
          state.setConfirmDialog(
            buildMergeAbortDialog({
              t,
              onConfirm: () => state.runGitCommand(gitClient.buildMergeAbortArgs(), t('generated.app.merge_aborted_b602bf32')),
            }),
          ),
      },
      {
        id: 'merge-continue',
        label: t('generated.app.continue_merge_56cfed8e'),
        keywords: ['merge', 'continue', 'fortsetzen'],
        action: () => state.runGitCommand(gitClient.buildMergeContinueArgs(), t('generated.app.merge_continued_63b9ee36')),
      },
      {
        id: 'rebase-abort',
        label: t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71'),
        keywords: ['rebase', 'abort', 'abbrechen'],
        action: () =>
          state.setConfirmDialog(
            buildRebaseAbortDialog({
              t,
              onConfirm: () => state.runGitCommand(gitClient.buildRebaseAbortArgs(), t('generated.app.rebase_aborted_74ce61c8')),
            }),
          ),
      },
      {
        id: 'rebase-continue',
        label: t('generated.components.layout.main.mainprimarypane.continue_rebase_828a1cd9'),
        keywords: ['rebase', 'continue', 'fortsetzen'],
        action: () => state.runGitCommand(gitClient.buildRebaseContinueArgs(), t('generated.app.rebase_continued_181b298d')),
      },
      {
        id: 'cherry-pick-abort',
        label: t('generated.components.layout.main.mainprimarypane.abort_cherry_pick_5b6c7d8e'),
        keywords: ['cherry-pick', 'cherrypick', 'abort', 'abbrechen'],
        action: () =>
          state.setConfirmDialog(
            buildCherryPickAbortDialog({
              t,
              onConfirm: () => state.runGitCommand(gitClient.buildCherryPickAbortArgs(), t('generated.app.cherry_pick_aborted_c9d0e1f2')),
            }),
          ),
      },
      {
        id: 'cherry-pick-continue',
        label: t('generated.components.layout.main.mainprimarypane.continue_cherry_pick_1d2e3f4a'),
        keywords: ['cherry-pick', 'cherrypick', 'continue', 'fortsetzen'],
        action: () => state.runGitCommand(gitClient.buildCherryPickContinueArgs(), t('generated.app.cherry_pick_continued_a1b2c3d4')),
      },
      {
        id: 'open-folder',
        label: t('generated.app.open_repository_09ccbb87'),
        keywords: ['open', 'folder', 'oeffnen'],
        action: () => state.handleOpenFolder(),
      },
      {
        id: 'clone-url',
        label: t('generated.app.clone_repository_from_url_94b504ff'),
        keywords: ['clone', 'url', 'ssh', 'http'],
        action: () => state.handleCloneByUrl(),
      },
      {
        id: 'fork-url',
        label: 'Fork · Hosting',
        keywords: ['fork', 'github', 'forgejo', 'gitlab', 'bitbucket'],
        action: () => {
          useHostingState.getState().navigate('repositories');
          state.setActiveTab('hosting');
        },
      },
      {
        id: 'add-remote',
        label: t('generated.app.add_remote_3a4267c1'),
        keywords: ['remote', 'add', 'hinzufuegen'],
        action: () => {
          if (!state.activeRepo) return;
          state.setActiveTab('repo');
          state.onOpenRemoteConfig();
        },
      },
    ],
    [state, t],
  );
