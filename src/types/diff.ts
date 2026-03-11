export type DiffSource = 'staged' | 'unstaged' | 'commit';

export interface DiffRequest {
  source: DiffSource;
  path: string;
  commitHash?: string;
  title?: string;
}
