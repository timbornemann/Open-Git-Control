export function normalizeBranchRefForMerge(branchName: string): string {
  if (branchName.startsWith('remotes/')) {
    return branchName.slice('remotes/'.length);
  }
  return branchName;
}

export type ParsedRemoteBranchRef = {
  remoteRef: string;
  localBranchName: string;
};

export function parseRemoteBranchRef(branchName: string): ParsedRemoteBranchRef | null {
  const normalized = String(branchName || '')
    .trim()
    .replace(/^remotes\//, '');
  if (!normalized) return null;

  const firstSlash = normalized.indexOf('/');
  if (firstSlash <= 0 || firstSlash >= normalized.length - 1) {
    return null;
  }

  return {
    remoteRef: normalized,
    localBranchName: normalized.slice(firstSlash + 1),
  };
}

export function mergeTargetFromDecoratedRef(ref: string): string | null {
  if (ref.startsWith('tag:')) return null;
  if (ref === 'HEAD') return null;
  const headArrow = ref.match(/^HEAD\s*->\s*(.+)$/);
  if (headArrow) return headArrow[1].trim();
  return ref;
}

export function mergeableDecoratedRefs(refs: string[], currentBranch: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const target = mergeTargetFromDecoratedRef(ref);
    if (!target) continue;
    if (target === currentBranch) continue;
    if (seen.has(target)) continue;
    seen.add(target);
    out.push(target);
  }
  return out;
}
