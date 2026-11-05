import type { DemoCommit, DemoRepository } from './demoRepository';

export function seedDemoBranchRefs(repo: DemoRepository, path = repo.activeRepo) {
  const head = repo.commits[0]?.hash;
  repo.branchHeads = new Map(head ? repo.branches.map((name) => [name, head]) : []);
  repo.remoteHeads = new Map(head && repo.originFor(path) ? [['origin/main', head]] : []);
  repo.branchUpstreams = new Map(head && repo.originFor(path) ? [['main', 'origin/main']] : []);
}
export function namedDemoHash(repo: DemoRepository, name: string): string | undefined {
  const point = /^HEAD@\{(\d+)\}$/.exec(name);
  if (point) return repo.reflog[Number(point[1])]?.hash;
  const backup = repo.messageEditBackups.find((entry) => entry.ref === name);
  if (backup) return backup.hash;
  const tagName = name.replace(/^refs\/tags\//, '').replace(/\^\{(?:commit)?\}$/, '');
  if (name.startsWith('refs/tags/') || tagName !== name) return repo.tagRefs.get(tagName)?.target;
  if (name === 'HEAD' || name === repo.branch) return repo.commits[0]?.hash;
  if (name === 'stash' || name === 'refs/stash') return repo.stashes[0]?.hash;
  const stash = /^stash@\{(\d+)\}$/.exec(name);
  if (stash) return repo.stashes[Number(stash[1])]?.hash;
  const local = name.replace(/^refs\/heads\//, '');
  const remote = name.replace(/^(?:refs\/)?remotes\//, '');
  return repo.branchHeads.get(local) ?? repo.remoteHeads.get(remote) ?? repo.tagRefs.get(tagName)?.target;
}
/** Object storage includes abandoned commits; the graph includes reachable refs. */
export function reachableDemoCommits(repo: DemoRepository, roots?: readonly string[]): DemoCommit[] {
  const references = roots ? [...roots] : [repo.commits[0]?.hash, ...repo.branchHeads.values(), ...repo.remoteHeads.values()];
  if (!roots && repo.stashes[0]) references.push(repo.stashes[0].hash);
  if (!roots) references.push(...[...repo.tagRefs.values()].map((tag) => tag.target));
  const objects = new Map(repo.commits.map((commit) => [commit.hash, commit]));
  const reachable = new Set<string>();
  while (references.length) {
    const hash = references.pop();
    if (!hash || reachable.has(hash)) continue;
    const commit = objects.get(hash);
    if (!commit) continue;
    reachable.add(hash);
    references.push(...commit.parent.split(/\s+/).filter(Boolean));
  }
  const selected = repo.commits.filter((commit) => reachable.has(commit.hash));
  const children = new Map(selected.map((commit) => [commit.hash, 0]));
  for (const commit of selected)
    for (const parent of commit.parent.split(/\s+/)) {
      if (children.has(parent)) children.set(parent, children.get(parent)! + 1);
    }
  const available = selected.filter((commit) => children.get(commit.hash) === 0);
  const ordered: DemoCommit[] = [];
  while (available.length) {
    available.sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
    const commit = available.shift()!;
    ordered.push(commit);
    for (const parent of commit.parent.split(/\s+/)) {
      if (!children.has(parent)) continue;
      const remaining = children.get(parent)! - 1;
      children.set(parent, remaining);
      if (remaining === 0) available.push(objects.get(parent)!);
    }
  }
  return ordered;
}
export function demoBranchDecorations(repo: DemoRepository, hash: string): string[] {
  const names: string[] = [];
  if (hash === repo.commits[0]?.hash) names.push(repo.branch ? 'HEAD -> ' + repo.branch : 'HEAD');
  for (const [name, target] of repo.branchHeads) if (target === hash && name !== repo.branch) names.push(name);
  for (const [name, target] of repo.remoteHeads) if (target === hash) names.push(name);
  if (repo.stashes[0]?.hash === hash) names.push('refs/stash');
  for (const [name, tag] of repo.tagRefs) if (tag.target === hash) names.push('tag: ' + name);
  return names;
}
export function demoUpstreamStatus(repo: DemoRepository): string {
  const upstream = repo.branchUpstreams.get(repo.branch);
  if (!upstream || !repo.remoteHeads.has(upstream)) return '';
  const objects = new Map(repo.commits.map((commit) => [commit.hash, commit]));
  const ancestors = (start?: string) => {
    const found = new Set<string>();
    const pending = start ? [start] : [];
    while (pending.length) {
      const hash = pending.pop()!;
      if (found.has(hash)) continue;
      found.add(hash);
      pending.push(...(objects.get(hash)?.parent.split(/\s+/).filter(Boolean) || []));
    }
    return found;
  };
  const local = ancestors(repo.commits[0]?.hash),
    remote = ancestors(repo.remoteHeads.get(upstream));
  return (
    '# branch.upstream ' +
    upstream +
    '\n# branch.ab +' +
    [...local].filter((hash) => !remote.has(hash)).length +
    ' -' +
    [...remote].filter((hash) => !local.has(hash)).length +
    '\n'
  );
}
