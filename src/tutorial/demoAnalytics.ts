import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { DEMO_REPO, DEMO_TIME, type DemoRepository } from './demoRepository';

export function demoAnalytics(repo: DemoRepository, filters: AnalyticsFilters = DEFAULT_ANALYTICS_FILTERS): RepositoryAnalyticsSnapshot {
  const author = { id: 'alex@example.invalid', name: 'Alex Beispiel', email: 'alex@example.invalid' };
  const commits = repo.commits.filter(
    (commit) =>
      (!filters.since || commit.date.slice(0, 10) >= filters.since) &&
      (!filters.until || commit.date.slice(0, 10) <= filters.until) &&
      (!filters.author || [author.id, author.name].includes(filters.author)),
  );
  const periods = commits.map((commit) => ({ date: commit.date.slice(0, 10), commits: 1, merges: 0, additions: 3, deletions: 1 }));
  const changes = Object.keys(repo.files).map((path) => ({
    additions: 8,
    deletions: 2,
    changes: 10,
    authors: 1,
    lastChanged: DEMO_TIME,
    path,
    hash: repo.commits[0].hash,
    binary: false,
  }));
  return {
    id: `tutorial-${repo.revision}`,
    repoPath: DEMO_REPO,
    savedAt: DEMO_TIME,
    complete: true,
    filters,
    sections: ['history', 'project', 'blame', 'comparison'],
    authors: [author],
    head: repo.commits[0].hash,
    refs: repo.branches.map((name) => ({ name, oid: repo.commits[0].hash, remote: false })),
    tags: [{ name: 'v1.0.0', oid: repo.commits[2].hash, date: DEMO_TIME - 2 * 86400000, version: true }],
    totals: { commits: 4, merges: 0, contributors: 1, firstActivity: DEMO_TIME - 3 * 86400000, lastActivity: DEMO_TIME },
    filteredCommits: commits.length,
    additions: commits.length * 3,
    deletions: commits.length,
    excludedCouplingCommits: 0,
    contributors: [{ ...author, commits: 4, merges: 0, additions: 12, deletions: 4, files: 3, lines: 12 }],
    periods,
    calendar: periods,
    hotspots: changes.filter((entry) => !filters.path || entry.path.includes(filters.path)),
    directories: changes,
    coupling: [{ first: 'README.md', second: 'src/app.ts', commits: 2, share: 0.5 }],
    project: {
      oid: repo.commits[0].hash,
      files: 3,
      textFiles: 3,
      binaryFiles: 0,
      lfsFiles: 0,
      symlinks: 0,
      submodules: 0,
      excludedFiles: 0,
      lines: 12,
      blamedLines: 12,
      unblamedFiles: 0,
      languages: [
        { language: 'TypeScript', files: 1, lines: 1 },
        { language: 'Markdown', files: 1, lines: 3 },
      ],
      ownership: [{ ...author, lines: 12 }],
    },
    comparison: null,
    warnings: [],
  };
}
