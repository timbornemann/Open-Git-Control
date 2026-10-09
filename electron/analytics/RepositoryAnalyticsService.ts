import type { GitService } from '../GitService';
import type {
  AnalyticsRequest,
  AnalyticsProgress,
  RepositoryAnalyticsSnapshot,
  AnalyticsDetailRequest,
  AnalyticsDetails,
  AnalyticsCommit,
} from '../../src/shared/ipc/repositoryAnalytics';
import { AnalyticsGit } from './AnalyticsGit';
import { AnalyticsCache, digest } from './AnalyticsCache';
import { AnalyticsRules } from './AnalyticsRules';
import { captureAnalyticsRefs, resolveAnalyticsRevision, validateAnalyticsFilters } from './AnalyticsRefs';
import { aggregateAnalytics, dateMatches, pathMatches, eligibleChanges } from './AnalyticsAggregation';
import { analyzeProject, emptyProject } from './AnalyticsProject';
import { classifySmallHistoricalBlobs } from './AnalyticsBlobs';
import { readComparison, buildComparison } from './AnalyticsComparison';
import type { CommitRecord } from './AnalyticsTypes';

type FullReport = {
  snapshot: RepositoryAnalyticsSnapshot;
  commits: (AnalyticsCommit & { paths: string[] })[];
  all: Awaited<ReturnType<typeof aggregateAnalytics>>;
  comparisonPaths: RepositoryAnalyticsSnapshot['hotspots'];
};
export class RepositoryAnalyticsService {
  private reports = new Map<string, FullReport>();
  constructor(
    private readonly gitService: GitService,
    private readonly cacheRoot: string,
  ) {}
  snapshot(request: AnalyticsRequest): RepositoryAnalyticsSnapshot | null {
    const filters = validateAnalyticsFilters(request.filters);
    const value = AnalyticsCache.readSnapshot(this.cacheRoot, request.repoPath);
    return value && JSON.stringify(value.filters) === JSON.stringify(filters) ? value : null;
  }
  async refresh(request: AnalyticsRequest, signal: AbortSignal, onProgress: (event: AnalyticsProgress) => void): Promise<RepositoryAnalyticsSnapshot> {
    const filters = validateAnalyticsFilters(request.filters);
    const initial = new AnalyticsGit(this.gitService, request.repoPath, signal);
    const captured = await captureAnalyticsRefs(initial);
    const revision = resolveAnalyticsRevision(filters.revision, captured);
    const git = new AnalyticsGit(this.gitService, request.repoPath, signal, revision);
    const tree = revision ? await git.tree(revision) : [];
    const context = await git.signature(tree);
    const cache = new AnalyticsCache(this.cacheRoot, request.repoPath, context);
    await cache.load();
    cache.data.snapshot = AnalyticsCache.readSnapshot(this.cacheRoot, request.repoPath);
    const rules = new AnalyticsRules(git, tree);
    const emit = (phase: AnalyticsProgress['phase'], completed: number, total: number, snapshot?: RepositoryAnalyticsSnapshot) =>
      onProgress({ repoPath: request.repoPath, requestId: request.readRequest?.requestId ?? '', phase, completed, total, ...(snapshot ? { snapshot } : {}) });
    let partial: RepositoryAnalyticsSnapshot | undefined;
    try {
      const roots =
        filters.scope === 'all'
          ? [...new Set([...captured.refs.map((ref) => ref.oid), captured.head].filter(Boolean))]
          : [resolveAnalyticsRevision(filters.scope, captured)].filter(Boolean);
      const selected = await git.membership(roots);
      const headMembers = await git.membership(captured.head ? [captured.head] : []);
      const reachable = new Map(headMembers.map((oid, index) => [oid, index]));
      const versionTags = captured.tags.filter((tag) => tag.version && reachable.has(tag.oid));
      versionTags.sort((a, b) => b.date - a.date || reachable.get(a.oid)! - reachable.get(b.oid)! || a.name.localeCompare(b.name));
      const from = filters.compareFrom || versionTags[0]?.name || '';
      const to = filters.compareTo || 'HEAD';
      const fromOid = from ? resolveAnalyticsRevision(from, captured) : '';
      const toOid = captured.head || filters.compareTo !== 'HEAD' ? resolveAnalyticsRevision(to, captured) : '';
      const comparisonHashes = fromOid && toOid ? await git.membership([toOid, `^${fromOid}`]) : [];
      const needed = [...new Set([...selected, ...(revision ? await git.membership([revision]) : []), ...comparisonHashes])];
      const missing = needed.filter((hash) => !cache.data.commits.has(hash));
      let processed = 0;
      emit('history', 0, missing.length);
      await git.commits(missing, (record) => {
        cache.put('commit', record);
        emit('history', ++processed, missing.length);
      });
      if (needed.some((hash) => !cache.data.commits.has(hash))) throw new Error('The local Git history could not be completely read.');
      await classifySmallHistoricalBlobs(git, cache, needed);
      const comparisonRecord = fromOid && toOid ? await readComparison(git, fromOid, toOid) : null;
      const allPaths = [
        ...tree.map((entry) => entry.path),
        ...needed.flatMap((hash) => cache.data.commits.get(hash)!.changes.map((change) => change.path)),
        ...(comparisonRecord?.changes.map((change) => change.path) ?? []),
      ];
      await rules.prepare(
        allPaths,
        needed.map((hash) => cache.data.commits.get(hash)!.author),
      );
      const records = selected.map((hash) => cache.data.commits.get(hash)!);
      const all = await aggregateAnalytics(records, rules, filters, cache.data.blobs, signal);
      const warnings: string[] = [];
      if ((await git.text(['rev-parse', '--is-shallow-repository'])).trim() === 'true')
        warnings.push('Shallow repository: only locally available history is included.');
      const comparison = comparisonRecord
        ? await buildComparison(git, cache, rules, comparisonRecord, comparisonHashes, from, to, fromOid, toOid, filters.path)
        : null;
      const snapshot: RepositoryAnalyticsSnapshot = {
        ...all,
        id: digest(JSON.stringify([captured, filters])),
        repoPath: request.repoPath,
        savedAt: Date.now(),
        complete: false,
        filters,
        ...captured,
        authors: [
          ...new Map(
            records.map((record) => {
              const author = rules.author(record.author);
              return [author.id, author] as const;
            }),
          ).values(),
        ],
        hotspots: all.hotspots.slice(0, 100),
        directories: all.directories.slice(0, 100),
        coupling: all.coupling.slice(0, 100),
        project: emptyProject(revision),
        comparison: comparison ? { ...comparison, paths: comparison.paths.slice(0, 100) } : null,
        warnings,
        sections: ['history', 'comparison'],
      };
      const report: FullReport = { snapshot, all, commits: this.commitRows(records, rules, filters, cache), comparisonPaths: comparison?.paths ?? [] };
      this.reports.clear();
      this.reports.set(snapshot.id, report);
      partial = snapshot;
      emit('aggregation', selected.length, selected.length, snapshot);
      if (revision) {
        snapshot.project = await analyzeProject(git, cache, rules, tree, revision, filters.path, emit, (project) => {
          snapshot.project = project;
          snapshot.sections.push('project');
          emit('project', project.files, project.files, snapshot);
        });
      } else snapshot.sections.push('project');
      snapshot.sections.push('blame');
      if (context !== (await git.signature(tree))) {
        cache.discardRecords();
        partial = undefined;
        throw new Error('Repository attributes changed during the analysis. Refresh to capture the current rules.');
      }
      snapshot.complete = warnings.length === 0 && snapshot.project.unblamedFiles === 0;
      if (snapshot.project.unblamedFiles) snapshot.warnings.push('Some text files could not be fully attributed. Blame coverage is shown separately.');
      snapshot.savedAt = Date.now();
      for (const person of snapshot.contributors) person.lines = snapshot.project.ownership.find((author) => author.id === person.id)?.lines ?? 0;
      snapshot.authors = [
        ...new Map(
          [...snapshot.authors, ...snapshot.project.ownership.map(({ lines: _lines, ...author }) => author)].map((author) => [author.id, author]),
        ).values(),
      ];
      cache.saveSnapshot(this.cacheRoot, snapshot);
      return snapshot;
    } finally {
      cache.flush();
      if (partial && !partial.complete) cache.saveSnapshot(this.cacheRoot, partial);
      rules.dispose();
    }
  }
  private commitRows(records: CommitRecord[], rules: AnalyticsRules, filters: AnalyticsRequest['filters'], cache: AnalyticsCache) {
    return records
      .filter(
        (record) =>
          dateMatches(record.date, filters.since, filters.until) &&
          (!filters.author || rules.author(record.author).id === filters.author) &&
          (!filters.path || eligibleChanges(record, rules, filters.path, cache.data.blobs).length),
      )
      .map((record) => {
        const changes = eligibleChanges(record, rules, filters.path, cache.data.blobs);
        return {
          hash: record.hash,
          parents: record.parents,
          author: rules.author(record.author),
          date: record.date,
          subject: record.subject,
          files: changes.length,
          additions: changes.reduce((sum, change) => sum + change.additions, 0),
          deletions: changes.reduce((sum, change) => sum + change.deletions, 0),
          paths: changes.map((change) => change.path),
        };
      })
      .sort((a, b) => b.date - a.date);
  }
  details(request: AnalyticsDetailRequest): AnalyticsDetails {
    const report = this.reports.get(request.snapshotId);
    if (!report || report.snapshot.repoPath !== request.repoPath) throw new Error('This analytics snapshot is no longer active. Refresh the dashboard.');
    let rows: AnalyticsDetails['items'];
    switch (request.kind) {
      case 'commits':
        rows = report.commits
          .filter(
            (commit) =>
              (!request.path || commit.paths.some((path) => pathMatches(path, request.path!))) &&
              (!request.author || commit.author.id === request.author) &&
              dateMatches(commit.date, request.since ?? '', request.until ?? ''),
          )
          .map(({ paths: _paths, ...commit }) => commit);
        break;
      case 'hotspots':
        rows = report.all.hotspots;
        break;
      case 'directories':
        rows = report.all.directories;
        break;
      case 'coupling':
        rows = report.all.coupling;
        break;
      case 'comparison':
        rows = report.comparisonPaths;
        break;
      default:
        throw new Error('Invalid analytics detail kind.');
    }
    const offset = Number.isFinite(request.offset) ? Math.max(0, Math.floor(request.offset)) : 0;
    const limit = Number.isFinite(request.limit) ? Math.max(1, Math.min(200, Math.floor(request.limit))) : 100;
    return { items: rows.slice(offset, offset + limit), total: rows.length, offset };
  }
}
