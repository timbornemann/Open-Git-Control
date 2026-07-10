import { useCallback } from 'react';
import type { CatalogTranslateFn, TranslateFn } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { ToastMessage } from '@/types/git';
import type { FileEntry } from '@/utils/gitParsing';
import type { FileSection } from './types';

type Params = {
  setToast: (msg: ToastMessage | null) => void;
  tr: TranslateFn;
  t: CatalogTranslateFn;
  onRepoChanged?: () => void;
  refresh: () => Promise<void>;
};

export const useIgnoreRule = ({ setToast, tr, t, onRepoChanged, refresh }: Params) => {
  return useCallback(
    async (entry: FileEntry, section: FileSection, pattern: string) => {
      if (!gitClient.isAvailable()) return;
      const normalizedPattern = pattern.trim();
      if (!normalizedPattern) return;
      try {
        const result = await gitClient.addIgnoreRule(normalizedPattern);
        if (!result.success) {
          setToast({ msg: result.error || t('generated.components.staging_area.usefileoperations.could_not_update_gitignore_074773f8'), isError: true });
          return;
        }
        if (section === 'staged' && entry.x === 'A') {
          await gitClient.runGitCommand('reset', 'HEAD', '--', entry.path);
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
    [setToast, tr, onRepoChanged, refresh, t],
  );
};
