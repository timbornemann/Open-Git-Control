import { useCallback } from 'react';
import type { CatalogTranslateFn, TranslateFn } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { ToastMessage } from '@/types/git';
import type { FileEntry } from '@/utils/gitParsing';
import type { FileSection } from './types';

type Params = {
  repoPath: string | null;
  setToast: (msg: ToastMessage | null) => void;
  tr: TranslateFn;
  t: CatalogTranslateFn;
  onRepoChanged?: () => void;
  refresh: () => Promise<void>;
};

export const useIgnoreRule = ({ repoPath, setToast, tr, t, onRepoChanged, refresh }: Params) => {
  return useCallback(
    async (entry: FileEntry, section: FileSection, pattern: string) => {
      if (!gitClient.isAvailable()) return;
      // Pin the whole operation to the repository that was active when the rule
      // was requested. Both the .gitignore write and the follow-up unstage are
      // repo-scoped so that a concurrent repository switch cannot apply the
      // .gitignore change to one repo and the unstage to another.
      const repoAtStart = repoPath;
      if (!repoAtStart) return;
      const normalizedPattern = pattern.trim();
      if (!normalizedPattern) return;
      try {
        const result = await gitClient.addIgnoreRule(normalizedPattern, repoAtStart);
        if (!result.success) {
          setToast({ msg: result.error || t('generated.components.staging_area.usefileoperations.could_not_update_gitignore_074773f8'), isError: true });
          return;
        }
        if (section === 'staged' && entry.x === 'A') {
          await gitClient.runGitCommandForRepo(repoAtStart, 'reset', 'HEAD', '--', entry.path);
        }
        setToast({
          msg: result.added
            ? tr(`Ignore-Regel hinzugefuegt: ${normalizedPattern}`, `Added ignore rule: ${normalizedPattern}`)
            : tr(`Regel existiert bereits: ${normalizedPattern}`, `Rule already exists: ${normalizedPattern}`),
          isError: false,
        });
        if (onRepoChanged) onRepoChanged();
        await refresh();
      } catch (e: any) {
        setToast({ msg: e.message || t('generated.components.staging_area.usefileoperations.could_not_update_gitignore_074773f8'), isError: true });
      }
    },
    [repoPath, setToast, tr, onRepoChanged, refresh, t],
  );
};
