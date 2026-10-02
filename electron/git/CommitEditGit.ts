import type { GitRunOptions } from './GitProcessTypes';

/** Only available inside one scheduler-owned write job; never exposed over IPC. */
export type CommitEditGit = {
  run: (repoPath: string, args: string[], options?: GitRunOptions & { ignoreAbort?: boolean }) => Promise<string>;
  buffer: (repoPath: string, args: string[]) => Promise<Buffer>;
  input: (repoPath: string, args: string[], input: string, ignoreAbort?: boolean) => Promise<string>;
};
