import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { isFullGitObjectId } from '@/utils/gitObjectId';
import { parseConflictingTagNames, remoteTagTrackingRefPrefix, TAG_REFERENCE_STATUS_FORMAT } from '@/utils/tagConflicts';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import { buildCreateTagDialog, buildDeleteTagDialog } from './repositoryDomainDialogs';
import type { GitActionToast } from './repositoryDomainTypes';
import type { RunGitCommandOptions } from '@/app/state/contracts';
import { gitWorkflowCommands } from '../workflows/gitWorkflowCommands';

type Params = {
  activeRepo: string | null;
  refreshTrigger: number;
  currentBranch: string;
  trackedRemoteName: string | null;
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
  trackedRemoteName,
  language,
  setGitActionToast,
  runGitCommand,
  setConfirmDialog,
  setInputDialog,
  onNavigateToCommit,
}: Params) => {
  const [tags, setTags] = useState<string[]>([]);
  const [tagConflicts, setTagConflicts] = useState<string[]>([]);
  const { t, tr } = useLanguageTranslations(language);
  const activeRepoRef = useRef<string | null>(activeRepo);

  useLayoutEffect(() => {
    activeRepoRef.current = activeRepo;
    setTags([]);
    setTagConflicts([]);
  }, [activeRepo]);

  useEffect(() => {
    if (!activeRepo || !gitClient.isAvailable()) {
      setTags([]);
      setTagConflicts([]);
      return;
    }

    let cancelled = false;
    const fetchTags = async () => {
      try {
        const [byVersion, referenceStatus] = await Promise.all([
          gitClient.runGitCommandForRepo(activeRepo, 'tag', '-l', '--sort=-v:refname'),
          trackedRemoteName
            ? gitClient.runGitCommandForRepo(activeRepo, 'forEachRef', TAG_REFERENCE_STATUS_FORMAT, 'refs/tags', remoteTagTrackingRefPrefix(trackedRemoteName))
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setTags(byVersion.success ? parseTags(byVersion.data) : []);
        setTagConflicts(referenceStatus?.success ? parseConflictingTagNames(referenceStatus.data, trackedRemoteName) : []);
      } catch {
        if (cancelled) return;
        setTags([]);
        setTagConflicts([]);
      }
    };

    fetchTags();
    return () => {
      cancelled = true;
    };
  }, [activeRepo, refreshTrigger, trackedRemoteName]);

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
    const adoptsTrackedRemoteTag = Boolean(trackedRemoteName && tagConflicts.includes(tagName));
    setConfirmDialog(
      buildDeleteTagDialog({
        tagName,
        t,
        tr,
        onDelete: async () => {
          const deleted = await runGitCommand(gitClient.buildDeleteTagArgs(tagName), tr(`Tag "${tagName}" gelöscht.`, `Deleted tag "${tagName}".`), undefined, {
            expectedRepoPath: repoAtDialogOpen,
          });
          if (!deleted || !adoptsTrackedRemoteTag || !trackedRemoteName) return;

          // The user explicitly chose to remove the conflicting local tag.
          // Fetching this one remote ref preserves annotated-tag metadata and
          // makes the now-unambiguous remote tag the single local tag.
          await runGitCommand(
            gitWorkflowCommands.adoptRemoteTag(trackedRemoteName, tagName),
            tr(`Remote-Tag "${tagName}" lokal übernommen.`, `Remote tag "${tagName}" adopted locally.`),
            undefined,
            { expectedRepoPath: repoAtDialogOpen },
          );
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
    tagConflicts,
    handleCreateTag,
    handleDeleteTag,
    handleSelectTag,
    handlePushTags,
  };
};
