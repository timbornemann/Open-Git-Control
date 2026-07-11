import * as path from 'path';
import type { GitRunner } from './GitRunner';
import { cleanupPrivateTempDir, createPrivateTempDir, writePrivateTempFile } from './PrivateTempFiles';

const REBASE_TODO_ACTIONS = new Set(['pick', 'reword', 'edit', 'squash', 'fixup', 'drop']);
const COMMIT_HASH_RE = /^[0-9a-f]{7,64}$/i;
const MAX_REBASE_TODO_LINES = 500;
const MAX_REBASE_TODO_LINE_LENGTH = 1_000;

/**
 * The interactive editor accepts commands such as `exec`, which can execute
 * arbitrary shell programs. The UI intentionally supports only commit
 * reordering/editing actions, so reject every other todo instruction here.
 */
export function normalizeInteractiveRebaseTodo(todoLines: unknown): string[] {
  if (!Array.isArray(todoLines) || todoLines.length === 0) {
    throw new Error('Rebase todo list is empty.');
  }
  if (todoLines.length > MAX_REBASE_TODO_LINES) {
    throw new Error(`Rebase todo list must not contain more than ${MAX_REBASE_TODO_LINES} lines.`);
  }

  return todoLines.map((value, index) => {
    if (typeof value !== 'string') {
      throw new Error(`Invalid rebase todo line ${index + 1}.`);
    }
    const line = value.trim();
    if (!line || line.length > MAX_REBASE_TODO_LINE_LENGTH || /[\0\r\n]/.test(line)) {
      throw new Error(`Invalid rebase todo line ${index + 1}.`);
    }

    const match = line.match(/^(pick|reword|edit|squash|fixup|drop)\s+([0-9a-f]{7,64})(?:\s+(.*))?$/i);
    if (!match || !REBASE_TODO_ACTIONS.has(match[1].toLowerCase()) || !COMMIT_HASH_RE.test(match[2])) {
      throw new Error(`Unsupported rebase todo instruction on line ${index + 1}.`);
    }

    const action = match[1].toLowerCase();
    const hash = match[2].toLowerCase();
    const subject = (match[3] || '').trim();
    if (action === 'reword' && !subject) {
      throw new Error(`Reword instruction on line ${index + 1} requires a replacement subject.`);
    }
    return subject ? `${action} ${hash} ${subject}` : `${action} ${hash}`;
  });
}

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
    const helperScript = [
      "const fs = require('fs');",
      "const path = require('path');",
      'const target = process.argv[2];',
      "const source = process.env.OGC_REBASE_TODO_FILE || '';",
      'if (!target || !source) process.exit(1);',
      "const todoLines = JSON.parse(fs.readFileSync(source, 'utf8'));",
      'const rebaseStateDir = path.dirname(target);',
      'const output = [];',
      'let rewordIndex = 0;',
      'for (const line of todoLines) {',
      '  const match = line.match(/^reword\\s+([0-9a-f]{7,64})\\s+(.+)$/i);',
      '  if (!match) { output.push(line); continue; }',
      '  const fileName = `ogc-reword-${rewordIndex}.txt`;',
      "  fs.writeFileSync(path.join(rebaseStateDir, fileName), match[2].trim() + '\\n', { encoding: 'utf8', mode: 0o600 });",
      '  output.push(`pick ${match[1]} ${match[2].trim()}`);',
      '  output.push(`exec git commit --amend -F "$(git rev-parse --git-path rebase-merge)/${fileName}"`);',
      '  rewordIndex += 1;',
      '}',
      "fs.writeFileSync(target, output.join('\\n') + '\\n', 'utf8');",
    ].join('\n');

    writePrivateTempFile(helperPath, helperScript);
    writePrivateTempFile(todoPath, JSON.stringify(normalizedLines));

    const quotedNode = `"${process.execPath.replace(/"/g, '\\"')}"`;
    const quotedHelper = `"${helperPath.replace(/"/g, '\\"')}"`;

    try {
      return await this.runGit.run(repoPath, ['rebase', '-i', normalizedBase], {
        envOverrides: {
          ELECTRON_RUN_AS_NODE: '1',
          GIT_EDITOR: 'true',
          GIT_SEQUENCE_EDITOR: `${quotedNode} ${quotedHelper}`,
          LC_ALL: 'C',
          OGC_REBASE_TODO_FILE: todoPath,
        },
        requestedKind: 'write',
      });
    } finally {
      cleanupPrivateTempDir(tempDir);
    }
  }
}
