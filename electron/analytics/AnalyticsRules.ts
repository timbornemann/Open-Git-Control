import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AnalyticsIdentity } from '../../src/shared/ipc/repositoryAnalytics';
import type { TreeEntry } from './AnalyticsTypes';
import type { AnalyticsGit } from './AnalyticsGit';
import { identity } from './AnalyticsParsing';
import { digest } from './AnalyticsCache';

/** A temporary, isolated Git worktree gives check-ignore Git's own complete matching semantics. */
export class AnalyticsRules {
  private directory: string;
  readonly rawWorktree: string;
  private ignores = new Set<string>();
  private mappings = new Map<string, AnalyticsIdentity>();
  fingerprint: string;
  constructor(
    private readonly git: AnalyticsGit,
    private readonly tree: TreeEntry[],
  ) {
    this.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-analytics-rules-'));
    this.rawWorktree = path.join(this.directory, 'raw-blame-worktree');
    fs.mkdirSync(this.rawWorktree);
    this.fingerprint = digest(
      JSON.stringify(tree.filter((entry) => /(^|\/)(\.gitignore|\.gitattributes|\.mailmap)$/.test(entry.path)).map((entry) => [entry.path, entry.oid])),
    );
  }
  async prepare(paths: string[], authors: AnalyticsIdentity[]): Promise<void> {
    await this.git.text(['-c', 'core.hooksPath=', 'init', '--quiet', '--template=', this.directory]);
    for (const entry of this.tree.filter((item) => /(^|\/)(\.gitignore|\.mailmap)$/.test(item.path) && item.mode.startsWith('100'))) {
      const target = path.resolve(this.directory, entry.path);
      if (!target.startsWith(this.directory + path.sep)) throw new Error('Invalid analytics rules path.');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await this.git.object(entry.oid));
    }
    await this.matchPaths(paths);
    await this.mapAuthors(authors);
  }
  ignored(filePath: string): boolean {
    return this.ignores.has(filePath);
  }
  author(author: AnalyticsIdentity): AnalyticsIdentity {
    return this.mappings.get(author.id) ?? author;
  }
  private async matchPaths(paths: string[]): Promise<void> {
    const unique = [...new Set(paths)];
    if (!unique.length) return;
    let output = '';
    try {
      output = await this.git.text(['-c', 'core.excludesFile=', 'check-ignore', '--no-index', '-z', '--stdin'], unique.join('\0') + '\0', this.directory);
    } catch (error) {
      if (!/failed \(1\)/.test(String(error))) throw error;
    }
    this.ignores = new Set(output.split('\0').filter(Boolean));
  }
  async mapAuthors(authors: AnalyticsIdentity[]): Promise<void> {
    const unique = [...new Map(authors.map((author) => [author.id, author])).values()].filter((author) => !this.mappings.has(author.id));
    if (!unique.length) return;
    const input = unique.map((author) => `${author.name.replace(/[\r\n]/g, ' ')} <${author.email.replace(/[\r\n]/g, '')}>`).join('\n') + '\n';
    const output = await this.git.text(['-c', 'mailmap.file=', '-c', 'mailmap.blob=', 'check-mailmap', '--stdin'], input, this.directory);
    output
      .trimEnd()
      .split('\n')
      .forEach((line, index) => {
        const match = /^(.*?)\s*<([^>]*)>$/.exec(line.replace(/\r$/, ''));
        if (match && unique[index]) this.mappings.set(unique[index].id, identity(match[1].trim(), match[2]));
      });
  }
  dispose(): void {
    const target = path.resolve(this.directory);
    if (path.dirname(target) === path.resolve(os.tmpdir()) && path.basename(target).startsWith('ogc-analytics-rules-'))
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
