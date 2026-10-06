import type { RepositoryFileSourceDto } from '../../types/gitDtos';
import type { TextFileEncodingDto } from './contracts/git';

export type RepositoryFileContextDto = {
  repoPath: string;
  path: string;
  source: RepositoryFileSourceDto;
  commitHash?: string;
};

export type RepositoryFilePreviewRequestDto = RepositoryFileContextDto & { allowLargeImage?: boolean };
export type RepositoryFileSnapshotDto = {
  lfs?: { oid: string; bytes: number; available: boolean };
  /** Opaque, source- and repository-bound compare-and-swap token. */
  version: string;
  editable: boolean;
  readOnlyReason?: string;
  modifiedAt?: string;
};
export type RepositoryFilePreviewDto = RepositoryFileSnapshotDto &
  (
    | { kind: 'text'; text: string; bytes: number; isMarkdown: boolean; encoding: TextFileEncodingDto }
    | { kind: 'image'; dataUrl: string; mimeType: string; bytes: number }
    | { kind: 'binary'; bytes: number; mimeType: string | null; reason: 'binary' | 'tooLarge'; canLoadImage?: boolean }
    | { kind: 'missing'; bytes: 0; reason: string }
  );
export type RepositoryFileInfoDto = RepositoryFileSnapshotDto & {
  path: string;
  bytes: number;
  hashes: { sha256: string; sha1: string; md5: string } | null;
};
export type SaveRepositoryFileRequestDto = RepositoryFileContextDto & {
  expectedVersion: string;
  content: string;
  encoding: TextFileEncodingDto;
};
export type SaveRepositoryFileResultDto = {
  version: string;
  bytes: number;
  modifiedAt?: string;
};
