import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters, type RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import { DEMO_TIME, type DemoRepository } from './demoRepository';
import { reachableDemoCommits } from './demoBranchRefs';

export function demoAnalytics(repo: DemoRepository, filters: AnalyticsFilters = DEFAULT_ANALYTICS_FILTERS): RepositoryAnalyticsSnapshot {
  const author = { id: 'alex@example.invalid', name: 'Alex Beispiel', email: 'alex@example.invalid' };
  const head = repo.commits[0]?.hash || '';
  const history = reachableDemoCommits(repo);
  const commits = history.filter(
    (commit) =>
      (!filters.since || commit.date.slice(0, 10) >= filters.since) &&
      (!filters.until || commit.date.slice(0, 10) <= filters.until) &&
      (!filters.author || [author.id, author.name].includes(filters.author)),
  );
  const periods = commits.map((commit) => ({ date: commit.date.slice(0, 10), commits: 1, merges: 0, additions: 3, deletions: 1 }));
  const changes = (head ? Object.keys(repo.files) : []).map((path) => ({
    additions: 8,
    deletions: 2,
    changes: 10,
    authors: 1,
    lastChanged: DEMO_TIME,
    path,
    hash: head,
    binary: false,
  }));
  return {
    id: `tutorial-${repo.revision}`,
    repoPath: repo.activeRepo,
    savedAt: DEMO_TIME,
    complete: true,
    filters,
    sections: ['history', 'project', 'blame', 'comparison'],
    authors: head ? [author] : [],
    head,
    refs: head ? [...repo.branchHeads].map(([name, oid]) => ({ name, oid, remote: false })) : [],
    tags: [...repo.tagRefs].flatMap(([name, tag]) => {
      const commit = repo.commits.find((entry) => entry.hash === tag.target);
      return commit ? [{ name, oid: tag.target, date: Date.parse(commit.date), version: /^v?\d/.test(name) }] : [];
    }),
    totals: {
      commits: history.length,
      merges: 0,
      contributors: head ? 1 : 0,
      firstActivity: head ? DEMO_TIME - (history.length - 1) * 86400000 : 0,
      lastActivity: head ? DEMO_TIME : 0,
    },
    filteredCommits: commits.length,
    additions: commits.length * 3,
    deletions: commits.length,
    excludedCouplingCommits: 0,
    contributors: head ? [{ ...author, commits: history.length, merges: 0, additions: 12, deletions: 4, files: 3, lines: 12 }] : [],
    periods,
    calendar: periods,
    hotspots: changes.filter((entry) => !filters.path || entry.path.includes(filters.path)),
    directories: changes,
    coupling: repo.files['src/app.ts'] && head ? [{ first: 'README.md', second: 'src/app.ts', commits: 2, share: 0.5 }] : [],
    project: {
      oid: head,
      files: head ? Object.keys(repo.files).length : 0,
      textFiles: head ? Object.keys(repo.files).length : 0,
      binaryFiles: 0,
      lfsFiles: 0,
      symlinks: 0,
      submodules: 0,
      excludedFiles: 0,
      lines: head ? 12 : 0,
      blamedLines: head ? 12 : 0,
      unblamedFiles: 0,
      languages: head
        ? [
            { language: 'TypeScript', files: 1, lines: 1 },
            { language: 'Markdown', files: 1, lines: 3 },
          ]
        : [],
      ownership: head ? [{ ...author, lines: 12 }] : [],
    },
    comparison: null,
    warnings: [],
  };
}
