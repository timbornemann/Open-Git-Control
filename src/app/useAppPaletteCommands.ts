import { useMemo } from 'react';
import type { PaletteCommand } from '@/components/CommandPalette';
import type { useAppState } from '@/components/layout/useAppState';
import type { TranslationVariables } from '@/i18n';

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
        id: 'tab-github',
        label: t('generated.components.layout.settingsmaincontent.github_6d98f785'),
        keywords: ['github', 'pr', 'pull request'],
        action: () => state.setActiveTab('github'),
      },
      {
        id: 'tab-settings',
        label: t('generated.components.layout.main.mainprimarypane.settings_c6256784'),
        keywords: ['settings', 'preferences'],
        action: () => state.setActiveTab('settings'),
      },
      {
        id: 'fetch',
        label: t('generated.app.fetch_refresh_remote_88270faa'),
        keywords: ['fetch', 'remote', 'sync'],
        action: () => state.refreshRemoteState(true),
      },
      {
        id: 'pull',
        label: t('generated.app.pull_8c55fb85'),
        keywords: ['pull', 'download'],
        action: () => state.runGitCommand(['pull'], t('generated.app.pull_completed_successfully_a760cd36')),
      },
      {
        id: 'pull-rebase',
        label: t('generated.app.pull_rebase_5d462c6a'),
        keywords: ['pull', 'rebase'],
        action: () => state.runGitCommand(['pull', '--rebase'], t('generated.app.pull_with_rebase_completed_a6e6129f')),
      },
      {
        id: 'push',
        label: t('generated.app.push_61ad6264'),
        keywords: ['push', 'upload'],
        action: () => state.runGitCommand(['push'], t('generated.app.push_completed_successfully_edf8c1c9')),
      },
      {
        id: 'push-force',
        label: t('generated.app.push_force_with_lease_f7c67bfe'),
        keywords: ['push', 'force'],
        action: () => state.runGitCommand(['push', '--force-with-lease'], t('generated.app.force_push_completed_1f9d562e')),
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
        action: () => state.runGitCommand(['stash', 'push', '-m', 'Quick stash'], t('generated.app.stash_created_56116f06')),
      },
      {
        id: 'stash-pop',
        label: t('generated.app.apply_last_stash_pop_120593db'),
        keywords: ['stash', 'pop', 'apply', 'anwenden'],
        action: () => state.runGitCommand(['stash', 'pop'], t('generated.app.stash_applied_4b30902e')),
      },
      {
        id: 'merge-abort',
        label: t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66'),
        keywords: ['merge', 'abort', 'abbrechen'],
        action: () => state.runGitCommand(['mergeAbort'], t('generated.app.merge_aborted_b602bf32')),
      },
      {
        id: 'merge-continue',
        label: t('generated.app.continue_merge_56cfed8e'),
        keywords: ['merge', 'continue', 'fortsetzen'],
        action: () => state.runGitCommand(['mergeContinue'], t('generated.app.merge_continued_63b9ee36')),
      },
      {
        id: 'rebase-abort',
        label: t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71'),
        keywords: ['rebase', 'abort', 'abbrechen'],
        action: () => state.runGitCommand(['rebaseAbort'], t('generated.app.rebase_aborted_74ce61c8')),
      },
      {
        id: 'rebase-continue',
        label: t('generated.components.layout.main.mainprimarypane.continue_rebase_828a1cd9'),
        keywords: ['rebase', 'continue', 'fortsetzen'],
        action: () => state.runGitCommand(['rebaseContinue'], t('generated.app.rebase_continued_181b298d')),
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
        label: t('generated.app.fork_github_repository_from_url_6e2cc177'),
        keywords: ['fork', 'github', 'url'],
        action: () => state.handleForkByUrl(),
      },
      {
        id: 'add-remote',
        label: t('generated.app.add_remote_3a4267c1'),
        keywords: ['remote', 'add', 'hinzufuegen'],
        action: () => {
          state.setActiveTab('repo');
          state.handleAddRemote();
        },
      },
    ],
    [state, t],
  );
