import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { computeGraphLayout, graphLayoutSeed } from '../graphLayout';
import { parseGitLog, type GitCommit } from '../gitParsing';

function removeGraphFixture(root: string) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-merge-graph-')) throw new Error('Unsafe graph cleanup.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

it('keeps four real merged pull requests on the same main line across fetch, remote deletion and pull', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-merge-graph-'));
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(root, 'no-global-config') },
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  const configure = (repo: string) => {
    git(repo, 'config', 'user.name', 'Graph Test');
    git(repo, 'config', 'user.email', 'graph@example.invalid');
    git(repo, 'config', 'commit.gpgsign', 'false');
  };
  const snapshot = (repo: string): GitCommit[] => {
    const commits = parseGitLog(git(repo, 'log', '--all', '--topo-order', '-z', '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%P%x1f%x00'));
    const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
    for (const line of git(repo, 'for-each-ref', '--format=%(objectname)%00%(refname)%00%(HEAD)', 'refs/heads/', 'refs/remotes/').split('\n')) {
      const [hash, ref, head] = line.replace(/\r$/, '').split('\0');
      const commit = byHash.get(hash);
      if (!commit) continue;
      if (ref.startsWith('refs/heads/')) commit.refs.push(head === '*' ? `HEAD -> ${ref.slice(11)}` : ref.slice(11));
      else commit.refs.push(ref.slice('refs/remotes/'.length));
    }
    return commits;
  };
  try {
    const server = path.join(root, 'github.git'),
      publisher = path.join(root, 'maintainer'),
      local = path.join(root, 'app-clone');
    fs.mkdirSync(server);
    fs.mkdirSync(publisher);
    git(server, 'init', '--bare', '-b', 'main');
    git(publisher, 'init', '-b', 'main');
    configure(publisher);
    git(publisher, 'commit', '--allow-empty', '-m', 'Initial commit');
    git(publisher, 'remote', 'add', 'origin', server);
    git(publisher, 'push', '-u', 'origin', 'main');
    git(root, 'clone', server, local);
    configure(local);
    for (let request = 1; request <= 4; request++) {
      const branch = `test-${request}`;
      git(local, 'switch', '-c', branch);
      git(local, 'commit', '--allow-empty', '-m', `Feature ${request}`);
      git(local, 'push', '-u', 'origin', branch);
      git(publisher, 'fetch', 'origin');
      git(publisher, 'merge', '--no-ff', '-m', `Merge pull request #${request}`, `origin/${branch}`);
      git(publisher, 'push', 'origin', 'main');
      git(publisher, 'push', 'origin', '--delete', branch);
      git(local, 'switch', 'main');
      git(local, 'fetch', '--prune', 'origin');
      const beforeRows = snapshot(local);
      const before = computeGraphLayout(beforeRows);
      const mainHashes = git(local, 'rev-list', '--first-parent', 'origin/main').split('\n');
      git(local, 'pull', '--ff-only', 'origin', 'main');
      const afterRows = snapshot(local);
      expect(afterRows.map((commit) => commit.hash)).toEqual(beforeRows.map((commit) => commit.hash));
      const after = computeGraphLayout(afterRows, graphLayoutSeed(afterRows, before));
      for (const graph of [before, after]) {
        expect(graph.nodes.filter((node) => mainHashes.includes(node.commit.hash)).every((node) => node.lane === 0)).toBe(true);
        expect(graph.edges.filter((edge) => edge.kind === 'merge')).toHaveLength(request);
        expect(graph.maxLane).toBe(1);
      }
      expect(after.nodes.map((node) => node.lane)).toEqual(before.nodes.map((node) => node.lane));
    }
  } finally {
    removeGraphFixture(root);
  }
}, 30_000);
