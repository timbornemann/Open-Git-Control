import type { GitRunOptions } from './GitProcessTypes';

/** Only available inside one scheduler-owned write job; never exposed over IPC. */
export type CommitEditGit = {
  signal?: AbortSignal;
  prefix?: (repoPath: string, args: string[], maxBytes: number) => Promise<Buffer>;
  run: (repoPath: string, args: string[], options?: GitRunOptions & { ignoreAbort?: boolean }) => Promise<string>;
  buffer: (repoPath: string, args: string[]) => Promise<Buffer>;
  input: (repoPath: string, args: string[], input: string | Buffer, ignoreAbort?: boolean, envOverrides?: NodeJS.ProcessEnv) => Promise<string>;
};
