import { toLiteralPathspec } from './RepositoryPathSafety';

type Run = (args: string[]) => Promise<string>;
type Change = { hash: string; status: string; path: string; oldPath?: string };

function parseChanges(raw: string): Change[] {
  const tokens = raw.split('\0');
  const changes: Change[] = [];
  let hash = '';
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index++].trim();
    if (/^[a-f0-9]{40,64}$/i.test(token)) {
      hash = token;
      continue;
    }
    if (!hash || !/^[ACDMRTUXB]\d*$/.test(token)) continue;
    const firstPath = tokens[index++];
    if (token.startsWith('R') || token.startsWith('C')) {
      const path = tokens[index++];
      changes.push({ hash, status: token[0], path, oldPath: firstPath });
    } else changes.push({ hash, status: token[0], path: firstPath });
  }
  return changes;
}

/** Find the current name of the same file, rather than following an old name
 * backward from HEAD and silently omitting all changes after its rename. */
export async function resolveLatestFileRevision(path: string, anchor: string, run: Run): Promise<{ path: string; revision: string }> {
  const head = (await run(['rev-parse', '--verify', 'HEAD'])).trim();
  if (head.toLowerCase().startsWith(anchor.toLowerCase())) return { path, revision: head };
  const descendants = await run(['rev-list', '--ancestry-path', '--max-count=1', `${anchor}..${head}`]);
  let tip = head;
  if (!descendants.trim()) {
    // A commit selected from another branch still gets that branch's newer
    // history; unrelated HEAD changes must not replace its own lineage.
    const refs = await run(['for-each-ref', `--contains=${anchor}`, '--sort=-committerdate', '--format=%(objectname)', 'refs/heads', 'refs/remotes']);
    tip =
      refs
        .trim()
        .split(/\s+/)
        .find((hash) => /^[a-f0-9]{40,64}$/i.test(hash)) || anchor;
    if (tip === anchor) return { path, revision: anchor };
  }
  // A deleted file's lineage ends here even if a different file later reuses
  // the same path.
  const exists = await run(['ls-tree', '-r', '--name-only', '-z', anchor, '--', toLiteralPathspec(path)]);
  if (!exists) return { path, revision: anchor };

  let cursor = anchor;
  const visited = new Set<string>();
  while (cursor !== tip && !visited.has(cursor)) {
    visited.add(cursor);
    const raw = await run([
      'log',
      '--reverse',
      '--topo-order',
      '--ancestry-path',
      '--diff-merges=first-parent',
      '--full-diff',
      '--diff-filter=DR',
      '--name-status',
      '-M',
      '-z',
      '--pretty=format:%H%x00',
      `${cursor}..${tip}`,
      '--',
      toLiteralPathspec(path),
    ]);
    const change = parseChanges(raw).find((change) => (change.status === 'R' && change.oldPath === path) || (change.status === 'D' && change.path === path));
    if (!change) break;
    if (change.status === 'D') return { path, revision: change.hash };
    path = change.path;
    cursor = change.hash;
  }
  return { path, revision: tip };
}
