import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { isFullGitObjectId } from '@/utils/gitObjectId';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildCreateTagDialog, buildDeleteTagDialog } from './repositoryDomainDialogs';
import type { GitActionToast } from './repositoryDomainTypes';
import type { RunGitCommandOptions } from '@/app/state/contracts';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  currentBranch: string;
  language: AppLanguage;
  setGitActionToast: (toast: GitActionToast) => void;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string, options?: RunGitCommandOptions) => Promise<boolean>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  onNavigateToCommit: (hash: string) => void;
};

const parseTags = (value: unknown): string[] =>
  String(value || '')
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);

export const useRepositoryTags = ({
  activeRepo,
  refreshTrigger,
  currentBranch,
  language,
  setGitActionToast,
  runGitCommand,
  setConfirmDialog,
  setInputDialog,
  onNavigateToCommit,
}: Params) => {
  const [tags, setTags] = useState<string[]>([]);
  const { t, tr } = useLanguageTranslations(language);
  const activeRepoRef = useRef<string | null>(activeRepo);

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
    setTags([]);
  }, [activeRepo]);

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setTags([]);
      return;
    }

    let cancelled = false;
    const fetchTags = async () => {
      try {
        const byVersion = await gitClient.runGitCommandForRepo(activeRepo, 'tag', '-l', '--sort=-v:refname');
        if (cancelled) return;
        setTags(byVersion.success ? parseTags(byVersion.data) : []);
      } catch {
        if (cancelled) return;
        setTags([]);
      }
    };

    fetchTags();
    return () => {
      cancelled = true;
    };
  }, [activeRepo, refreshTrigger]);

  const handleCreateTag = async () => {
    const repoAtDialogOpen = activeRepo;
    if (!repoAtDialogOpen) return;
    setInputDialog(
      buildCreateTagDialog({
        currentBranch,
        t,
        tr,
        onCreate: async (name, message) => {
          if (message) {
            await runGitCommand(gitClient.buildCreateTagArgs(name, { message }), tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`), undefined, {
              expectedRepoPath: repoAtDialogOpen,
            });
          } else {
            await runGitCommand(gitClient.buildCreateTagArgs(name), tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`), undefined, {
              expectedRepoPath: repoAtDialogOpen,
            });
          }
        },
      }),
    );
  };

  const handleDeleteTag = async (tagName: string) => {
    const repoAtDialogOpen = activeRepo;
    if (!repoAtDialogOpen) return;
    setConfirmDialog(
      buildDeleteTagDialog({
        tagName,
        t,
        tr,
        onDelete: async () => {
          await runGitCommand(gitClient.buildDeleteTagArgs(tagName), tr(`Tag "${tagName}" gelöscht.`, `Deleted tag "${tagName}".`), undefined, {
            expectedRepoPath: repoAtDialogOpen,
          });
        },
      }),
    );
  };

  const handleSelectTag = useCallback(
    async (tagName: string) => {
      if (!activeRepo || !gitClient.isAvailable()) return;

      try {
        const repoAtStart = activeRepo;
        const tagRef = `refs/tags/${tagName}^{commit}`;
        const result = await gitClient.runGitCommandForRepo(repoAtStart, 'show', '--quiet', '--format=%H', tagRef);
        if (repoAtStart !== activeRepoRef.current) return;
        const hash =
          String(result.data || '')
            .trim()
            .split(/\s+/)[0] || '';

        if (!result.success || !isFullGitObjectId(hash)) {
          setGitActionToast({
            msg: result.error || tr(`Commit fuer Tag "${tagName}" konnte nicht gefunden werden.`, `Could not find the commit for tag "${tagName}".`),
            isError: true,
          });
          return;
        }

        onNavigateToCommit(hash);
      } catch (error: any) {
        setGitActionToast({
          msg: error?.message || tr(`Tag "${tagName}" konnte nicht geoeffnet werden.`, `Could not open tag "${tagName}".`),
          isError: true,
        });
      }
    },
    [activeRepo, onNavigateToCommit, setGitActionToast, tr],
  );

  const handlePushTags = async () => {
    if (!activeRepo) return;
    await runGitCommand(gitClient.buildPushTagsArgs(), t('generated.components.layout.hooks.userepositorydomain.pushed_tags_d74ebef5'), undefined, {
      expectedRepoPath: activeRepo,
    });
  };

  return {
    tags,
    handleCreateTag,
    handleDeleteTag,
    handleSelectTag,
    handlePushTags,
  };
};
