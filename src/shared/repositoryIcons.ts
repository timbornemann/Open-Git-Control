export const REPOSITORY_ICON_SIZE = 128;
export const REPOSITORY_ICON_MAX_BYTES = 32 * 1024 * 1024;
export const REPOSITORY_ICON_MAX_SVG_BYTES = 2 * 1024 * 1024;
export const REPOSITORY_ICON_MAX_PNG_BYTES = 128 * 1024;

export type RepositoryIconMode = 'auto' | 'manual' | 'initials';
export type RepositoryIconThumbnail = { path: string; version: string; dataUrl: string };
export type RepositoryIconStateDto = {
  repoPath: string;
  mode: RepositoryIconMode;
  manualPath: string | null;
  selectionVersion: string;
  revision: number;
  thumbnail: RepositoryIconThumbnail | null;
  candidates: string[];
  limited: boolean;
  status: 'ready' | 'scanning' | 'unavailable';
  error: string | null;
};
export type RepositoryIconSourceDto = { path: string; version: string; dataUrl: string; mtimeMs: number; bytes: number };
export type RepositoryIconChoiceDto = { mode: RepositoryIconMode; path?: string; expectedSelectionVersion: string };
export type RepositoryIconCacheRequestDto = { path: string; sourceVersion: string; selectionVersion: string; expectedRevision: number; dataUrl: string };
