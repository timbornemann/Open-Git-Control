import * as path from 'path';
import type { GitRunner } from './GitRunner';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from './PrivateTempFiles';
import { gitHelperEnvironment, gitNodeHelperCommand } from './GitNodeHelper';
import { REBASE_SEQUENCE_EDITOR_SCRIPT } from './RebaseSequenceEditorScript';

import { COMMIT_HASH_RE, normalizeInteractiveRebaseTodo } from '../../src/shared/git/interactiveRebase';
export { normalizeInteractiveRebaseTodo } from '../../src/shared/git/interactiveRebase';

export class RebaseService {
  constructor(
    private readonly getRepoPath: () => string,
    private readonly runGit: Pick<GitRunner, 'run'>,
  ) {}

  async continueRebase(): Promise<string> {
    return this.runGit.run(this.getRepoPath(), ['rebase', '--continue'], {
      envOverrides: {
        GIT_EDITOR: 'true',
      },
    });
  }

  async abortRebase(): Promise<string> {
    return this.runGit.run(this.getRepoPath(), ['rebase', '--abort']);
  }

  async startInteractiveRebase(baseHash: string, todoLines: string[]): Promise<string> {
    return this.startInteractiveRebaseAtPath(this.getRepoPath(), baseHash, todoLines);
  }

  async startInteractiveRebaseAtPath(repoPath: string, baseHash: string, todoLines: string[]): Promise<string> {
    const normalizedBase = (baseHash || '').trim();
    if (!COMMIT_HASH_RE.test(normalizedBase)) {
      throw new Error('Invalid base commit hash for interactive rebase.');
    }

    const normalizedLines = normalizeInteractiveRebaseTodo(todoLines);

    const tempDir = createPrivateTempDir('ogc-rebase-editor-');
    const helperPath = path.join(tempDir, 'editor.js');
    const todoPath = path.join(tempDir, 'todo.txt');
    writePrivateTempFile(helperPath, REBASE_SEQUENCE_EDITOR_SCRIPT);
    writePrivateTempFile(todoPath, JSON.stringify(normalizedLines));

    try {
      return await this.runGit.run(repoPath, ['rebase', '-i', normalizedBase], {
        envOverrides: gitHelperEnvironment({
          GIT_EDITOR: 'true',
          GIT_SEQUENCE_EDITOR: gitNodeHelperCommand(helperPath),
          LC_ALL: 'C',
          OGC_REBASE_TODO_FILE: todoPath,
        }),
        requestedKind: 'write',
      });
    } finally {
      cleanupPrivateTempDir(tempDir);
    }
  }
}
