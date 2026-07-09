import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildCreateTagDialog, buildDeleteTagDialog } from './repositoryDomainDialogs';
import type { GitActionToast } from './repositoryDomainTypes';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  currentBranch: string;
  language: AppLanguage;
  setGitActionToast: (toast: GitActionToast) => void;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
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

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setTags([]);
      return;
    }

    const fetchTags = async () => {
      try {
        const byVersion = await gitClient.runGitCommand('tag', '-l', '--sort=-v:refname');
        setTags(byVersion.success ? parseTags(byVersion.data) : []);
      } catch {
        setTags([]);
      }
    };

    fetchTags();
  }, [activeRepo, refreshTrigger]);

  const handleCreateTag = async () => {
    setInputDialog(
      buildCreateTagDialog({
        currentBranch,
        t,
        tr,
        onCreate: async (name, message) => {
          if (message) {
            await runGitCommand(gitClient.buildCreateTagArgs(name, { message }), tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
          } else {
            await runGitCommand(gitClient.buildCreateTagArgs(name), tr(`Tag "${name}" erstellt.`, `Created tag "${name}".`));
          }
        },
      }),
    );
  };

  const handleDeleteTag = async (tagName: string) => {
    setConfirmDialog(
      buildDeleteTagDialog({
        tagName,
        t,
        tr,
        onDelete: async () => {
          await runGitCommand(gitClient.buildDeleteTagArgs(tagName), tr(`Tag "${tagName}" gelöscht.`, `Deleted tag "${tagName}".`));
        },
      }),
    );
  };

  const handleSelectTag = useCallback(
    async (tagName: string) => {
      if (!activeRepo || !gitClient.isAvailable()) return;

      try {
        const tagRef = `refs/tags/${tagName}^{commit}`;
        const result = await gitClient.runGitCommand('show', '--quiet', '--format=%H', tagRef);
        const hash =
          String(result.data || '')
            .trim()
            .split(/\s+/)[0] || '';

        if (!result.success || !/^[0-9a-f]{40}$/i.test(hash)) {
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
    await runGitCommand(gitClient.buildPushTagsArgs(), t('generated.components.layout.hooks.userepositorydomain.pushed_tags_d74ebef5'));
  };

  return {
    tags,
    handleCreateTag,
    handleDeleteTag,
    handleSelectTag,
    handlePushTags,
  };
};
