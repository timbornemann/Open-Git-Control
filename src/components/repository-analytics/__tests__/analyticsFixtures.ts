import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsComparison, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';

export function releaseComparison(): AnalyticsComparison {
  return {
    from: 'v1.0.0',
    to: 'HEAD',
    fromOid: 'a'.repeat(40),
    toOid: 'b'.repeat(40),
    ancestor: true,
    commits: 12,
    contributors: 3,
    additions: 900,
    deletions: 100,
    files: 10,
    paths: [{ path: 'src/do-not-list-me.ts', changes: 1, additions: 1, deletions: 0, authors: 1, lastChanged: 1000, hash: 'b'.repeat(40), binary: false }],
    summary: {
      fileChanges: { added: 2, modified: 6, deleted: 1, renamed: 1 },
      textFiles: 9,
      nonTextFiles: 1,
      areas: [
        { path: 'src/', files: 6, additions: 600, deletions: 60 },
        { path: 'docs/', files: 3, additions: 280, deletions: 30 },
        { path: '.', files: 1, additions: 20, deletions: 10 },
      ],
    },
  };
}

export function analyticsReport(repoPath = 'C:/repo', commits = 3): RepositoryAnalyticsSnapshot {
  return {
    id: repoPath,
    repoPath,
    savedAt: 1000,
    complete: true,
    filters: { ...DEFAULT_ANALYTICS_FILTERS },
    sections: ['history', 'project', 'blame', 'comparison'],
    authors: [{ id: 'alice', name: 'Alice', email: 'alice@test.invalid' }],
    refs: [{ name: 'refs/heads/main', oid: 'a'.repeat(40), remote: false }],
    tags: [{ name: 'v1.0.0', oid: 'a'.repeat(40), version: true, date: 1000 }],
    head: 'b'.repeat(40),
    totals: { commits, merges: 0, contributors: 1, firstActivity: 1000, lastActivity: 2000 },
    filteredCommits: commits,
    additions: 3,
    deletions: 0,
    excludedCouplingCommits: 0,
    contributors: [],
    periods: [{ date: '2026-10-08', commits, merges: 0, additions: 3, deletions: 0 }],
    calendar: [],
    hotspots: [{ path: 'a.ts', changes: 3, additions: 3, deletions: 0, authors: 1, hash: 'b'.repeat(40), lastChanged: 2000, binary: false }],
    directories: [],
    coupling: [],
    comparison: null,
    warnings: [],
    project: {
      oid: 'b'.repeat(40),
      files: 1,
      textFiles: 1,
      binaryFiles: 0,
      lfsFiles: 0,
      symlinks: 0,
      submodules: 0,
      excludedFiles: 0,
      lines: 3,
      blamedLines: 3,
      unblamedFiles: 0,
      languages: [{ language: 'TypeScript', files: 1, lines: 3 }],
      ownership: [],
    },
  };
}
