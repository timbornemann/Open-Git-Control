import type { GitService } from '../GitService';
import type { CommitRecord, TreeEntry } from './AnalyticsTypes';
import { AnalyticsLogParser, LOG_FORMAT, parseTree } from './AnalyticsParsing';
import * as fs from 'node:fs';
import { digest } from './AnalyticsCache';

export const OFFLINE_ENV: NodeJS.ProcessEnv = {
  GIT_NO_LAZY_FETCH: '1',
  GIT_ALLOW_PROTOCOL: '',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_NO_REPLACE_OBJECTS: '1',
};
export class AnalyticsGit {
  private directoryPromise?: Promise<string>;
  private versionPromise?: Promise<string>;
  constructor(
    readonly service: GitService,
    readonly repoPath: string,
    readonly signal: AbortSignal,
    readonly revision?: string,
  ) {}
  async stream(args: string[], consume: (chunk: Buffer) => void, input?: string, cwd = this.repoPath): Promise<void> {
    this.signal.throwIfAborted();
    const configured = [
      '-c',
      'core.attributesFile=',
      '-c',
      'diff.algorithm=myers',
      '-c',
      'diff.renames=true',
      '-c',
      'diff.renameLimit=0',
      '-c',
      'diff.ignoreSubmodules=none',
      ...args,
    ];
    await this.service.streamReadAtPath(cwd, configured, consume, this.signal, input, {
      ...OFFLINE_ENV,
      GIT_LITERAL_PATHSPECS: args.includes('blame') ? '1' : '0',
      ...(this.revision ? { GIT_ATTR_SOURCE: this.revision } : {}),
    });
  }
  async text(args: string[], input?: string, cwd = this.repoPath): Promise<string> {
    const chunks: Buffer[] = [];
    await this.stream(args, (chunk) => chunks.push(chunk), input, cwd);
    return Buffer.concat(chunks).toString('utf8');
  }
  async tree(oid: string): Promise<TreeEntry[]> {
    return parseTree(await this.text(['ls-tree', '-r', '-l', '-z', oid]));
  }
  directory(): Promise<string> {
    return (this.directoryPromise ??= this.text(['rev-parse', '--absolute-git-dir']).then((value) => value.trim()));
  }
  async signature(tree: TreeEntry[]): Promise<string> {
    const file = (await this.text(['rev-parse', '--path-format=absolute', '--git-path', 'info/attributes'])).trim();
    let attributes = '';
    if (fs.existsSync(file)) {
      if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error('Repository attributes are too large to capture safely.');
      attributes = digest(fs.readFileSync(file).toString('base64'));
    }
    const version = await (this.versionPromise ??= this.text(['version']));
    return digest(
      JSON.stringify([
        'diff-v3-raw-blame',
        version,
        attributes,
        tree.filter((entry) => /(^|\/)\.gitattributes$/.test(entry.path)).map((entry) => [entry.path, entry.oid]),
      ]),
    );
  }
  async object(oid: string, maxBytes = 4 * 1024 * 1024): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let bytes = 0;
    await this.stream(['cat-file', 'blob', oid], (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error('Analytics configuration file is too large.');
      chunks.push(chunk);
    });
    return Buffer.concat(chunks);
  }
  async membership(roots: string[]): Promise<string[]> {
    if (!roots.length) return [];
    const values = (await this.text(['rev-list', '--stdin'], roots.join('\n') + '\n')).trim().split(/\r?\n/).filter(Boolean);
    if (values.some((value) => !/^[0-9a-f]{40,64}$/.test(value))) throw new Error('Invalid analytics commit list.');
    return values;
  }
  async commits(hashes: string[], onCommit: (record: CommitRecord) => void): Promise<void> {
    for (let start = 0; start < hashes.length; start += 128) {
      this.signal.throwIfAborted();
      const parser = new AnalyticsLogParser(onCommit);
      await this.stream(
        [
          '-c',
          'diff.renames=true',
          'log',
          '--no-walk=unsorted',
          '--root',
          '--diff-merges=off',
          '--no-ext-diff',
          '--no-textconv',
          '--raw',
          '--numstat',
          '--no-abbrev',
          '-M',
          '-z',
          `--format=${LOG_FORMAT}`,
          '--stdin',
        ],
        (chunk) => parser.write(chunk),
        hashes.slice(start, start + 128).join('\n') + '\n',
      );
      parser.finish();
    }
  }
}
