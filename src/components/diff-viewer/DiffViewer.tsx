import { useMemo } from 'react';
import type { DiffRequest } from '@/types/diff';
import { FileViewer, type FileViewerProps } from '@/components/file-viewer/FileViewer';
import { fileViewerRequestFromDiff } from '@/components/file-viewer/fileViewerRequest';

type Props = Omit<FileViewerProps, 'request'> & { repoPath: string | null; request: DiffRequest };
/** Existing diff callers are translated centrally into source-aware requests. */
export function DiffViewer({ repoPath, request: diff, ...props }: Props) {
  const request = useMemo(() => fileViewerRequestFromDiff(repoPath || '', diff), [repoPath, diff]);
  return repoPath ? <FileViewer {...props} request={request} /> : null;
}
