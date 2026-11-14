import { useLayoutEffect, useState } from 'react';
import type { RepositoryFilePreviewDto } from '@/shared/ipc/repositoryFiles';
import { isHtmlFilePath } from '@/utils/htmlPreview';
import { isMarkdownFilePath } from '@/utils/markdownPreview';
import { fileViewerIdentity, type FileViewerRequest, type FileViewerTab } from './fileViewerRequest';

export function useFileViewerTab(request: FileViewerRequest, preview: RepositoryFilePreviewDto | null) {
  const identity = fileViewerIdentity(request);
  const initialTab = request.startView === 'auto' ? null : request.startView;
  const [selectedTab, setTab] = useState<FileViewerTab | null>(initialTab);
  const hasPreview = preview?.kind === 'image' || (preview?.kind === 'text' && (isHtmlFilePath(request.path) || isMarkdownFilePath(request.path)));
  // Resolve the default after the file loads. A manual choice survives later
  // loads and refreshes, including choosing Text before a preview is ready.
  const tab = selectedTab ?? (hasPreview && !request.position ? 'preview' : 'text');

  useLayoutEffect(() => {
    setTab(initialTab);
  }, [identity, initialTab]);
  useLayoutEffect(() => {
    if (request.position) setTab('text');
  }, [request.position]);

  return { tab, setTab, hasPreview };
}
