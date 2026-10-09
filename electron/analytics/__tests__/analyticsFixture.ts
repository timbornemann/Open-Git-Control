import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GitService } from '../../GitService';
import { RepositoryAnalyticsService } from '../RepositoryAnalyticsService';
import { DEFAULT_ANALYTICS_FILTERS, type AnalyticsFilters } from '../../../src/shared/ipc/repositoryAnalytics';
import { GitIntegrationLifecycle } from '../../git/__tests__/gitIntegrationLifecycle';

const fixtures: { root: string; lifecycle: GitIntegrationLifecycle }[] = [];
export async function cleanupAnalyticsFixtures() {
  for (const { root, lifecycle } of fixtures.splice(0)) {
    await lifecycle.close();
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-analytics-test-')) throw new Error('Unsafe cleanup.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
export async function fixture(withHistory = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-analytics-test-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const lifecycle = new GitIntegrationLifecycle();
  fixtures.push({ root, lifecycle });
  const git = (...args: string[]) => lifecycle.git(repo, ...args);
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Alice');
  await git('config', 'user.email', 'alice@example.invalid');
  await git('config', 'core.autocrlf', 'false');
  await git('config', 'commit.gpgsign', 'false');
  const write = (file: string, content: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  };
  if (withHistory) {
    write('.gitignore', 'vendor/*\n!vendor/keep.txt\n');
    write('a.ts', 'one\ntwo\n');
    write('b.ts', 'one\n');
    write('vendor/ignored.txt', 'hidden\n');
    write('vendor/keep.txt', 'kept\n');
    await git('add', '--force', '.');
    await git('commit', '-m', 'Initial');
    await git('tag', 'v1.0.0');
    await git('config', 'user.name', 'Bob');
    await git('config', 'user.email', 'bob@example.invalid');
    write('a.ts', 'one\ntwo\nthree\n');
    write('b.ts', 'one\ntwo\n');
    await git('add', '.');
    await git('commit', '-m', 'Second');
    await git('tag', 'v1.1.0');
    await git('config', 'user.name', 'Alice');
    await git('config', 'user.email', 'alice@example.invalid');
    write('a.ts', 'one\ntwo\nthree\nfour\n');
    write('b.ts', 'one\ntwo\nthree\n');
    await git('add', '.');
    await git('commit', '-m', 'Third');
  }
  const engine = new GitService();
  engine.setRepoPath(repo);
  const cache = path.join(root, 'cache');
  const service = new RepositoryAnalyticsService(engine, cache);
  const refresh = (filters: AnalyticsFilters = DEFAULT_ANALYTICS_FILTERS) =>
    lifecycle.track(service.refresh({ repoPath: repo, filters }, lifecycle.signal, () => {}));
  return { root, repo, lifecycle, engine, service, cache, git, write, refresh };
}
