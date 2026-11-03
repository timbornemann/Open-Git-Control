import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { GitLfsFileState, GitLfsStagingMode, GitLfsStatus, TrackWithGitLfsRequest } from '@/shared/ipc/gitLfs';
import type { FileEntry } from '@/utils/gitParsing';
import type { FileSection, InputDialogState } from './types';
import { useSystemTools } from '@/app/state/systemToolsStore';
import { freshRead, withReadPriority } from '@/data/clientCache';
import { cancellableRead } from '@/data/ipcRead';
import { isReadCancellation } from '@/data/readCancellation';

type Status = { staged: FileEntry[]; unstaged: FileEntry[]; untracked: FileEntry[] } | null;
export function useStagingLfs(
  repoPath: string | null,
  status: Status,
  track: (request: TrackWithGitLfsRequest) => Promise<boolean>,
  setInputDialog?: (dialog: InputDialogState | null) => void,
  { revision, busy = false }: { revision?: string | null; busy?: boolean } = {},
) {
  const lfsAvailability = useSystemTools((state) => {
    const tool = state.status?.tools.find((tool) => tool.id === 'git-lfs');
    return `${tool?.state}:${tool?.version}:${tool?.executable}`;
  });
  const { tr } = useI18n();
  const [snapshot, setSnapshot] = useState<{ repo: string; revision?: string; status: GitLfsStatus } | null>(null);
  const [retry, setRetry] = useState(0);
  const attempts = useRef(0);
  useEffect(() => {
    let active = true;
    if (!repoPath || !status || busy || revision === null || typeof gitClient.getGitLfsStatus !== 'function') return;
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const files = [
      ...status.staged.map((entry) => ({ path: entry.path, source: 'staged' as const })),
      ...[...status.unstaged, ...status.untracked].map((entry) => ({ path: entry.path, source: 'unstaged' as const })),
    ];
    const unique = [...new Map(files.map((file) => [`${file.source}:${file.path}`, file])).values()];
    void (async () => {
      // Keep only the newest queued status while a preview is being read.
      // The status includes no blob IDs or file timestamps: membership alone
      // cannot prove that an unchanged-looking entry still has the same content.
      if (!active) return;
      const states: GitLfsFileState[] = [];
      let available = true;
      let error: string | undefined;
      // The backend bounds its I/O and batches blob reads. Small IPC batches
      // otherwise reread the entire index and repository configuration each time.
      for (let offset = 0; offset < unique.length; offset += 10_000) {
        if (!active) return;
        const input = { repoPath, files: unique.slice(offset, offset + 10_000) };
        const result = await cancellableRead(controller.signal, 'speculative', (request) =>
          withReadPriority(() => freshRead(() => (request ? gitClient.getGitLfsStatus(input, request) : gitClient.getGitLfsStatus(input))), 'speculative'),
        );
        if (!result.success || !result.data) throw new Error(result.error || 'Git LFS inspection failed.');
        states.push(...result.data.files);
        available = result.data.available;
        error = result.data.error;
      }
      if (active) {
        attempts.current = 0;
        setSnapshot((current) => {
          const old = new Map(current?.repo === repoPath ? current.status.files.map((file) => [`${file.source}:${file.path}`, file]) : []);
          const files = states.map((file) => {
            const previous = old.get(`${file.source}:${file.path}`);
            return previous && sameFileState(previous, file) ? previous : file;
          });
          if (
            current?.repo === repoPath &&
            current.revision === revision &&
            current.status.available === available &&
            current.status.error === error &&
            current.status.files.length === files.length &&
            files.every((file, index) => file === current.status.files[index])
          )
            return current;
          return { repo: repoPath, revision, status: { available, error, files } };
        });
      }
    })().catch((error: unknown) => {
      if (!active) return;
      if (isReadCancellation(error)) retryTimer = setTimeout(() => setRetry((value) => value + 1), Math.min(300 * 2 ** attempts.current++, 5000));
      else setSnapshot({ repo: repoPath, revision, status: { available: false, files: [], error: error instanceof Error ? error.message : String(error) } });
    });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(retryTimer);
    };
  }, [repoPath, status, lfsAvailability, revision, busy, retry]);
  const data = !busy && revision !== null && snapshot?.repo === repoPath && snapshot.revision === revision ? snapshot.status : null;
  const filesBySource = useMemo(() => new Map(data?.files.map((file) => [`${file.source}:${file.path}`, file]) ?? []), [data]);
  const stateFor = (filePath: string, section: FileSection) => filesBySource.get(`${section === 'staged' ? 'staged' : 'unstaged'}:${filePath}`);
  const recommendationTitle = (file: GitLfsFileState): string => {
    const size = `${(file.bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
    return tr(
      `Git LFS empfohlen: ${file.recommendation === 'asset' ? 'große Medien-/Assetdatei' : 'große Binärdatei'} (${size}). Über das Kontextmenü umstellen.`,
      `Git LFS recommended: large ${file.recommendation === 'asset' ? 'media/asset' : 'binary'} file (${size}). Convert through the context menu.`,
    );
  };
  const trackFile = (entry: FileEntry, section: FileSection, scope: 'file' | 'extension', staging?: GitLfsStagingMode) => {
    const file = stateFor(entry.path, section);
    if (!repoPath || !file?.eligible || !data?.available) return Promise.resolve(false);
    return track({ repoPath, path: entry.path, source: file.source, scope, expectedVersion: file.version, ...(staging ? { staging } : {}) });
  };
  const configure = (entry: FileEntry, section: FileSection, scope: 'file' | 'extension') => {
    const file = stateFor(entry.path, section);
    if (!repoPath || !file?.eligible || !data?.available || (scope === 'extension' && !file.extension)) return;
    setInputDialog?.({
      title:
        scope === 'extension'
          ? tr('Dateityp mit Git LFS verwalten', 'Manage file type with Git LFS')
          : tr('Datei mit Git LFS verwalten', 'Manage file with Git LFS'),
      message:
        scope === 'extension'
          ? tr(
              `Die Regel *${file.extension} gilt im gesamten Repository. Wähle, ob du zusätzlich Dateien stagen möchtest.`,
              `The *${file.extension} rule applies throughout the repository. Choose whether to stage files as well.`,
            )
          : tr(
              'Die LFS-Regel gilt nur für diese Datei. Wähle, ob du sie zusätzlich stagen möchtest.',
              'The LFS rule applies only to this file. Choose whether to stage it as well.',
            ),
      contextItems: [{ label: tr('Datei', 'File'), value: entry.path }],
      fields: [
        {
          id: 'staging',
          label: tr('Staging', 'Staging'),
          type: 'select',
          defaultValue: 'none',
          options: [
            { value: 'none', label: tr('Nur zur LFS-Konfiguration hinzufügen', 'Add to LFS configuration only') },
            { value: 'selected', label: tr('Diese Datei zusätzlich stagen', 'Also stage this file') },
            ...(scope === 'extension' ? [{ value: 'matching', label: tr('Alle passenden Dateien stagen', 'Stage all matching files') }] : []),
          ],
          helperText:
            scope === 'extension'
              ? tr(
                  'Die ausgewählte Dateiversion wird verwendet. Bei anderen Dateien bleiben Teil-Stagings erhalten. Ignorierte neue Dateien und LFS-Ausnahmen werden übersprungen.',
                  'The selected file version is used. Other files retain existing partial staging. Ignored new files and LFS exclusions are skipped.',
                )
              : tr('Beim Stagen wird die hier ausgewählte Dateiversion verwendet.', 'Staging uses the file version selected here.'),
        },
      ],
      irreversible: false,
      consequences: tr(
        'Nur konfigurieren lässt das Staging unverändert. Beim Stagen wird auch die benötigte .gitattributes-Regel gestagt.',
        'Configuration only leaves staging unchanged. Staging also includes the required .gitattributes rule.',
      ),
      confirmLabel: tr('Übernehmen', 'Apply'),
      onSubmit: async ({ staging }) => {
        if (staging === 'none' || staging === 'selected' || (scope === 'extension' && staging === 'matching')) await trackFile(entry, section, scope, staging);
      },
    });
  };
  return {
    available: data?.available ?? false,
    loading: !data,
    error: data?.error,
    stateFor,
    recommendationTitle,
    track: trackFile,
    configure,
  };
}

function sameFileState(first: GitLfsFileState, second: GitLfsFileState): boolean {
  return (Object.keys({ ...first, ...second }) as Array<keyof GitLfsFileState>).every((key) => first[key] === second[key]);
}
