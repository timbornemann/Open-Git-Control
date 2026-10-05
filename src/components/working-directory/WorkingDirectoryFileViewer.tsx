import { useMemo } from 'react';
import { FileViewer, type FileViewerProps } from '@/components/file-viewer/FileViewer';
import { fileViewerRequestFromWorkingFile } from '@/components/file-viewer/fileViewerRequest';

type Props = Omit<FileViewerProps, 'request'> & { repoPath: string; path: string };
/** Compatibility entry point; all viewer behavior lives in FileViewer. */
export function WorkingDirectoryFileViewer({ repoPath, path, ...props }: Props) {
  const request = useMemo(() => fileViewerRequestFromWorkingFile(repoPath, path), [repoPath, path]);
  return <FileViewer {...props} request={request} />;
}
