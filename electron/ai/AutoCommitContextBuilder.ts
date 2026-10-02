import type { GitService } from '../GitService';
import { redactAiContext } from '../SecretScanService';
import { decodePorcelainPath } from './gitStatusSnapshot';
import type { AutoCommitContext, AutoCommitSnapshot, ChangeContext } from './AutoCommitPlanTypes';
import { AutoCommitObjectReader } from './AutoCommitObjectReader';
import { AutoCommitImportResolver } from './AutoCommitImportResolver';
import { buildRelationships, extractImports, extractReferences, extractSymbols } from './AutoCommitRelationships';

const addUnique = (target: string[], values: string[], limit: number) => {
  for (const value of values) if (target.length < limit && !target.includes(value)) target.push(value);
};

/** Bounded deterministic reservoir: later hunks can displace earlier samples. */
export class DiffHunkSampler {
  private samples: string[] = [];
  private count = 0;
  add(value: string): void {
    if (!value) return;
    this.count += 1;
    if (this.samples.length < 8) this.samples.push(value);
    else {
      const slot = (Math.imul(this.count, 2654435761) >>> 0) % this.count;
      if (slot < 8) this.samples[slot] = value;
    }
  }
  result(): string[] {
    return this.samples;
  }
}

export class AutoCommitContextBuilder {
  readonly objects: AutoCommitObjectReader;
  constructor(
    private readonly git: GitService,
    private readonly repoPath: string,
    private readonly signal?: AbortSignal,
  ) {
    this.objects = new AutoCommitObjectReader(git, repoPath, signal);
  }

  async build(snapshot: AutoCommitSnapshot): Promise<AutoCommitContext> {
    const changes: ChangeContext[] = snapshot.changes.map((change) => ({ ...change, hunks: [], symbols: [], references: [], imports: [] }));
    for (const source of ['staged', 'worktree'] as const) {
      const members = changes.filter((change) => change.source === source);
      if (!members.length) continue;
      const base = source === 'staged' ? snapshot.headTree : snapshot.stagedTree;
      const target = source === 'staged' ? snapshot.stagedTree : snapshot.worktreeTree;
      await this.readDiff(base, target, members);
    }
    await this.objects.initialize(snapshot.worktreeTree);
    const resolver = new AutoCommitImportResolver(this.objects);
    await resolver.initialize();
    await this.objects.load(changes.filter((change) => !change.binary && change.newMode !== '160000').map((change) => change.newBlob));
    for (const change of changes) {
      const content = this.objects.cache.get(change.newBlob) || '';
      addUnique(change.imports, extractImports(content), 48);
    }
    const relatedPaths = [
      ...new Set(
        changes
          .flatMap((change) => change.imports.map((specifier) => resolver.resolve(change.path, specifier)))
          .filter((file): file is string => Boolean(file)),
      ),
    ];
    const changedPaths = new Set(changes.map((change) => change.path));
    const extras = relatedPaths.filter((file) => !changedPaths.has(file)).slice(0, 16);
    await this.objects.load(extras.map((file) => this.objects.files.get(file)!));
    const relatedCode = extras
      .map((file) => ({
        path: file,
        excerpt: this.objects
          .read(file)
          .split('\n')
          .filter((line) => /\b(export|interface|type|class|function|def|struct|fn)\b/.test(line))
          .slice(0, 12)
          .join('\n')
          .slice(0, 1600),
      }))
      .filter((item) => item.excerpt);
    return { changes, relationships: buildRelationships(changes, resolver), relatedCode };
  }

  private async readDiff(base: string, target: string, changes: ChangeContext[]): Promise<void> {
    const byPath = new Map(
      changes.flatMap((change) => [[change.path, change] as const, ...(change.originalPath ? [[change.originalPath, change] as const] : [])]),
    );
    const samplers = new Map(changes.map((change) => [change.id, new DiffHunkSampler()]));
    let current: ChangeContext | undefined;
    let hunk: string[] = [];
    let hunkLines = 0;
    const flush = () => {
      if (current && hunk.length) samplers.get(current.id)!.add(hunk.join('\n'));
      hunk = [];
      hunkLines = 0;
    };
    const pathFromLine = (raw: string) => decodePorcelainPath(raw.replace(/\t$/, '')).replace(/^[ab]\//, '');
    await this.git.streamCommandLinesAtPath(
      this.repoPath,
      [
        '-c',
        'core.quotePath=true',
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--no-color',
        '--ignore-submodules=none',
        '--submodule=short',
        '--find-renames',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '--unified=3',
        base,
        target,
        '--',
      ],
      (raw) => {
        if (raw.startsWith('diff --git ')) {
          flush();
          current = undefined;
          return;
        }
        if (raw.startsWith('--- ')) {
          current = byPath.get(pathFromLine(raw.slice(4)));
          return;
        }
        if (raw.startsWith('+++ ') && raw.slice(4) !== '/dev/null') {
          current = byPath.get(pathFromLine(raw.slice(4)));
          return;
        }
        if (!current) return;
        const line = redactAiContext(raw).slice(0, 600);
        if (line.startsWith('@@')) {
          flush();
          hunk.push(line);
        } else if (hunk.length) {
          hunkLines += 1;
          if (hunk.length < 9) hunk.push(line);
          else if (hunkLines % 13 === 0) hunk[8] = line;
        }
        if (/^[+-]/.test(line) || line.startsWith('@@')) {
          addUnique(current.symbols, extractSymbols(line), 48);
          addUnique(current.references, extractReferences(line), 192);
          addUnique(current.imports, extractImports(line), 48);
        }
      },
      this.signal,
      { redactOutput: false },
    );
    flush();
    for (const change of changes) {
      const compact = /(^|\/)(dist|generated|build|vendor)\/|\.min\.|(^|\/)(package-lock\.json|.*\.lock|pnpm-lock\.yaml)$/.test(change.path);
      change.hunks = samplers
        .get(change.id)!
        .result()
        .slice(0, compact ? 2 : 8);
    }
  }
}
