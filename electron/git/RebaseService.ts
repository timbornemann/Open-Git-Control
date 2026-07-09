import * as path from 'path';
import type { GitRunner } from './GitRunner';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from './PrivateTempFiles';

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
    const repoPath = this.getRepoPath();
    const normalizedBase = (baseHash || '').trim();
    if (!normalizedBase) {
      throw new Error('Base commit hash is required for interactive rebase.');
    }

    const normalizedLines = Array.isArray(todoLines) ? todoLines.map((line) => String(line || '').trim()).filter(Boolean) : [];
    if (normalizedLines.length === 0) {
      throw new Error('At least one rebase todo line is required.');
    }

    const todoText = normalizedLines.join('\n') + '\n';
    const tempDir = createPrivateTempDir('ogc-rebase-editor-');
    const helperPath = path.join(tempDir, 'editor.js');
    const helperScript = [
      "const fs = require('fs');",
      'const target = process.argv[2];',
      'if (!target) process.exit(1);',
      "const raw = process.env.OGC_REBASE_TODO_B64 || '';",
      "const content = Buffer.from(raw, 'base64').toString('utf8');",
      "fs.writeFileSync(target, content, 'utf8');",
    ].join('\n');

    writePrivateTempFile(helperPath, helperScript);

    const quotedNode = `"${process.execPath.replace(/"/g, '\\"')}"`;
    const quotedHelper = `"${helperPath.replace(/"/g, '\\"')}"`;

    try {
      return await this.runGit.run(repoPath, ['rebase', '-i', normalizedBase], {
        envOverrides: {
          GIT_SEQUENCE_EDITOR: `${quotedNode} ${quotedHelper}`,
          OGC_REBASE_TODO_B64: Buffer.from(todoText, 'utf8').toString('base64'),
        },
        requestedKind: 'write',
      });
    } finally {
      cleanupPrivateTempDir(tempDir);
    }
  }
}
