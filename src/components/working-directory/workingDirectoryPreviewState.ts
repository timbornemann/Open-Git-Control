import { peekResource } from '@/data/clientCache';
import type { IpcResult } from '@/types/ipc';
import type { WorkingDirectoryPreviewDto, TextFileEncodingDto } from '@/shared/ipc/contracts/git';
import { detectLineEnding, normalizeToLf, type LineEnding } from '@/utils/lineEndings';

export const readCachedFilePreview = (repoPath: string, path: string) => {
  const result = peekResource<IpcResult<WorkingDirectoryPreviewDto>>('git', 'getWorkingDirectoryPreview', [path, repoPath]);
  return result?.success ? result.data : null;
};
export const previewTextState = (preview: WorkingDirectoryPreviewDto | null) => ({
  text: preview?.kind === 'text' ? normalizeToLf(preview.text) : '',
  encoding: preview?.kind === 'text' ? preview.encoding || 'utf8' : ('utf8' as TextFileEncodingDto),
  lineEnding: preview?.kind === 'text' ? detectLineEnding(preview.text) : ('\n' as LineEnding),
});

export const isDataLoading = (loading: boolean, hasData: boolean, error: string | null) => loading || (!hasData && !error);
