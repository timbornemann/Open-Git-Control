import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import type { GitLfsFileState, GitLfsStatus, TrackWithGitLfsRequest } from '@/shared/ipc/gitLfs';
import type { FileEntry } from '@/utils/gitParsing';
import type { FileSection } from './types';
import { useSystemTools } from '@/app/state/systemToolsStore';
import { freshRead } from '@/data/clientCache';

type Status = { staged: FileEntry[]; unstaged: FileEntry[]; untracked: FileEntry[] } | null;
export function useStagingLfs(repoPath: string | null, status: Status, track: (request: TrackWithGitLfsRequest) => Promise<boolean>) {
  const lfsAvailability = useSystemTools((state) => state.status?.tools.find((tool) => tool.id === 'git-lfs')?.state);
  const { tr } = useI18n();
  const [snapshot, setSnapshot] = useState<{ repo: string; status: GitLfsStatus } | null>(null);
  useEffect(() => {
    let active = true;
    if (!repoPath || !status || typeof gitClient.getGitLfsStatus !== 'function') return;
    const files = [
      ...status.staged.map((entry) => ({ path: entry.path, source: 'staged' as const })),
      ...[...status.unstaged, ...status.untracked].map((entry) => ({ path: entry.path, source: 'unstaged' as const })),
    ];
    const unique = [...new Map(files.map((file) => [`${file.source}:${file.path}`, file])).values()];
    void (async () => {
      const states: GitLfsFileState[] = [];
      let available = true;
      let error: string | undefined;
      for (let offset = 0; offset < unique.length; offset += 256) {
        if (!active) return;
        const result = await freshRead(() => gitClient.getGitLfsStatus({ repoPath, files: unique.slice(offset, offset + 256) }));
        if (!result.success || !result.data) throw new Error(result.error || 'Git LFS inspection failed.');
        states.push(...result.data.files);
        available = result.data.available;
        error = result.data.error;
      }
      if (active) setSnapshot({ repo: repoPath, status: { available, error, files: states } });
    })().catch((error: unknown) => {
      if (active) setSnapshot({ repo: repoPath, status: { available: false, files: [], error: error instanceof Error ? error.message : String(error) } });
    });
    return () => {
      active = false;
    };
  }, [repoPath, status, lfsAvailability]);
  const data = snapshot?.repo === repoPath ? snapshot.status : null;
  const filesBySource = useMemo(() => new Map(data?.files.map((file) => [`${file.source}:${file.path}`, file]) ?? []), [data]);
  const stateFor = (filePath: string, section: FileSection) => filesBySource.get(`${section === 'staged' ? 'staged' : 'unstaged'}:${filePath}`);
  const recommendationTitle = (file: GitLfsFileState): string => {
    const size = `${(file.bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MiB`;
    return tr(
      `Git LFS empfohlen: ${file.recommendation === 'asset' ? 'große Medien-/Assetdatei' : 'große Binärdatei'} (${size}). Über das Kontextmenü umstellen.`,
      `Git LFS recommended: large ${file.recommendation === 'asset' ? 'media/asset' : 'binary'} file (${size}). Convert through the context menu.`,
    );
  };
  return {
    available: data?.available ?? false,
    loading: !data,
    error: data?.error,
    stateFor,
    recommendationTitle,
    track: (entry: FileEntry, section: FileSection, scope: 'file' | 'extension') => {
      const file = stateFor(entry.path, section);
      if (!repoPath || !file?.eligible || !data?.available) return Promise.resolve(false);
      return track({ repoPath, path: entry.path, source: file.source, scope, expectedVersion: file.version });
    },
  };
}
