import type { GitStashEntryDto } from '@/types/gitDtos';
import { useI18n } from '@/i18n';
import { basename } from './utils';

type Props = {
  stash: GitStashEntryDto;
  state?: { loading: boolean; files: string[] };
  busy: boolean;
  pending: { stashName: string; path: string } | null;
  onRestore: (stashName: string, path: string) => Promise<void>;
};

export function StashFileList({ stash, state, busy, pending, onRestore }: Props) {
  const { t } = useI18n();
  return (
    <div className="stash-file-list">
      {state?.loading && <div className="stash-panel-hint">{t('generated.components.staging_area.stashpanel.loading_files_df8b1d70')}</div>}
      {!state?.loading && !state?.files.length && (
        <div className="stash-panel-hint">{t('generated.components.staging_area.stashpanel.no_files_found_5e448811')}</div>
      )}
      {!state?.loading &&
        state?.files.map((path) => (
          <div key={`${stash.name}:${path}`} className="stash-file-row" data-stash-path={path}>
            <span className="stash-file-path" title={path}>
              {basename(path)}
            </span>
            <button
              className="staging-btn-sm"
              disabled={busy || /\[OGC:[a-f0-9-]+\]/.test(stash.subject)}
              onClick={() => {
                void onRestore(stash.name, path);
              }}
              title={t('generated.components.staging_area.stashpanel.apply_file_from_this_stash_8651c38e')}
            >
              {pending?.stashName === stash.name && pending.path === path
                ? t('generated.components.staging_area.stashpanel.applying_74286d47')
                : t('generated.components.staging_area.stashpanel.apply_48b5b14b')}
            </button>
          </div>
        ))}
    </div>
  );
}
