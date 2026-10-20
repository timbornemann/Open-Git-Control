import type { BranchCleanupCandidate } from '../../src/shared/ipc/branchCleanup';
import type { RemotePreferences } from '../../src/types/remoteTransfers';
import { cleanupPatternMatches } from './BranchCleanupPreferences';
import {
  CLEANUP_OID,
  cleanupDigest,
  cleanupReason as reason,
  cleanupLocalLinks,
  cleanupMetadataKnown,
  cleanupOpenRequests,
  type CleanupAnalysis,
  type CleanupContext,
  type CleanupGit,
  type CleanupInternalTarget,
  type CleanupLocalState,
  type CleanupLocalBranch,
  type CleanupRemoteState,
} from './branchCleanupModel';

export type CleanupAnalysisInput = {
  local: CleanupLocalState;
  remotes: CleanupRemoteState[];
  preferences: RemotePreferences;
  patterns: string[];
  overrides: Record<string, string>;
  fingerprint: string;
  now: number;
};

async function makeTargets(git: CleanupGit, repo: string, input: CleanupAnalysisInput) {
  const targets: CleanupInternalTarget[] = [];
  const add = (comparisonId: string, branch: string, oid: string, name: string, extra: Pick<CleanupInternalTarget, 'localRef' | 'endpointId'>) => {
    const target = { id: cleanupDigest([comparisonId, branch, extra]).slice(0, 32), comparisonId, branch, name, oid, ...extra };
    targets.push(target);
    return target;
  };
  for (const branch of input.local.branches) add('local', branch.name, branch.oid, branch.name, { localRef: branch.ref });
  for (const remote of input.remotes.filter((entry) => entry.complete)) {
    for (const [name, oid] of remote.heads) {
      add('local', name, oid, `${remote.endpoint.remoteName}/${name} (${remote.endpoint.url})`, { endpointId: remote.endpoint.id });
      if (remote.endpoint.canDelete) add(remote.endpoint.id, name, oid, name, { endpointId: remote.endpoint.id });
    }
  }
  const choose = (id: string, defaultId?: string) =>
    Object.hasOwn(input.overrides, id)
      ? (targets.find((target) => target.comparisonId === id && target.id === input.overrides[id])?.id ?? null)
      : (defaultId ?? null);
  const remotes = input.remotes.filter((remote) => remote.complete);
  const preferred =
    remotes.find((remote) => remote.endpoint.remoteName === input.preferences.hostingRemote) ??
    remotes.find((remote) => remote.endpoint.remoteName === 'origin') ??
    (new Set(remotes.map((remote) => remote.endpoint.remoteName)).size === 1 ? remotes[0] : undefined);
  const mainCandidates = input.local.branches.filter((branch) => ['main', 'master'].includes(branch.name));
  const remoteDefault =
    preferred &&
    targets.find((target) => target.comparisonId === 'local' && target.endpointId === preferred.endpoint.id && target.branch === preferred.defaultBranch);
  let localDefault =
    (remoteDefault && targets.find((target) => target.localRef && target.branch === remoteDefault.branch)) ||
    remoteDefault ||
    (mainCandidates.length === 1 ? targets.find((target) => target.localRef === mainCandidates[0].ref) : undefined);
  // Prefer local integrations, but retain the newer server history when local main is simply behind it.
  if (localDefault?.localRef && remoteDefault && localDefault.oid !== remoteDefault.oid)
    if ((await countOutside(git, repo, localDefault.oid, remoteDefault, input.local.incomplete)) === 0) localDefault = remoteDefault;
  const comparisons = [{ id: 'local', label: 'local', targetId: choose('local', localDefault?.id) }];
  for (const remote of input.remotes.filter((entry) => entry.endpoint.canDelete))
    comparisons.push({
      id: remote.endpoint.id,
      label: `${remote.endpoint.remoteName} (${remote.endpoint.url})`,
      targetId: choose(remote.endpoint.id, targets.find((target) => target.comparisonId === remote.endpoint.id && target.branch === remote.defaultBranch)?.id),
    });
  return { targets, comparisons };
}

async function countOutside(git: CleanupGit, repo: string, oid: string, target: CleanupInternalTarget | undefined, incomplete: boolean) {
  if (!target || incomplete) return null;
  try {
    const raw = (await git.run(repo, ['rev-list', '--count', oid, '--not', target.oid])).trim();
    return /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
  } catch {
    return null;
  }
}

async function mergedRequestProof(
  git: CleanupGit,
  repo: string,
  name: string,
  oid: string,
  target: CleanupInternalTarget | undefined,
  remotes: CleanupRemoteState[],
): Promise<string> {
  if (!target) return '';
  for (const remote of remotes) {
    for (const request of remote.metadata?.mergedRequests ?? []) {
      if (request.sourceBranch !== name || request.headSha !== oid || request.targetBranch !== target.branch) continue;
      if (!CLEANUP_OID.test(request.mergeSha)) continue;
      if ((await countOutside(git, repo, request.mergeSha, target, false)) === 0) return `#${request.number}`;
    }
  }
  return '';
}

async function commitDates(git: CleanupGit, repo: string, input: CleanupAnalysisInput) {
  const dates = new Map(input.local.branches.map((branch) => [branch.oid, branch.lastCommitAt]));
  const missing = [...new Set(input.remotes.flatMap((remote) => [...remote.heads.values()]))].filter((oid) => !dates.has(oid));
  for (let offset = 0; offset < missing.length; offset += 64) {
    try {
      const output = await git.run(repo, ['show', '--no-patch', '--format=%H%x00%ct', '--end-of-options', ...missing.slice(offset, offset + 64)]);
      for (const line of output.split(/\r?\n/).filter(Boolean)) {
        const [oid, timestamp] = line.split('\0');
        if (CLEANUP_OID.test(oid) && /^\d+$/.test(timestamp)) dates.set(oid, Number(timestamp) * 1000);
      }
    } catch {
      /* Unavailable objects retain an unknown date and cannot prove inactivity. */
    }
  }
  return dates;
}

function decorateLocal(candidate: BranchCleanupCandidate, branch: CleanupLocalBranch, input: CleanupAnalysisInput) {
  candidate.upstream = branch.remote && branch.remoteRef ? `${branch.remote}/${branch.remoteRef.replace(/^refs\/heads\//, '')}` : undefined;
  candidate.worktrees = input.local.worktrees.filter((worktree) => worktree.branch === branch.name).map((worktree) => worktree.path);
  if (input.local.current === branch.name) candidate.blocks.push(reason('current'));
  if (candidate.worktrees.length) candidate.blocks.push(reason('worktree', candidate.worktrees.join('\n')));
  const upstreams = input.remotes.filter((remote) => remote.endpoint.remoteName === branch.remote && remote.endpoint.fetchUrl);
  if (branch.remote && branch.remote !== '.' && branch.remoteRef.startsWith('refs/heads/')) {
    const upstreamName = branch.remoteRef.slice(11);
    const gone = upstreams.length && upstreams.every((remote) => remote.complete && !remote.heads.has(upstreamName));
    if (!upstreams.length || gone) {
      candidate.reasons.push(reason(upstreams.length ? 'upstream-gone' : 'remote-removed', candidate.upstream));
      if (candidate.classification !== 'merged') candidate.classification = 'orphaned';
    }
  }
  for (const remote of input.remotes) {
    const names = new Set([branch.name]);
    if (branch.remote === remote.endpoint.remoteName && branch.remoteRef.startsWith('refs/heads/')) names.add(branch.remoteRef.slice(11));
    const push = input.preferences.pushBranches?.[branch.name]?.[remote.endpoint.remoteName];
    if (push) names.add(push);
    for (const name of names) {
      if (remote.metadata?.branches.some((entry) => entry.name === name && entry.protected === true))
        candidate.blocks.push(reason('protected', `${remote.endpoint.remoteName}/${name}`));
      const requests = cleanupOpenRequests(remote, name);
      if (requests.length) candidate.blocks.push(reason('open-request', requests.join(', ')));
    }
  }
  if (candidate.classification === 'other') candidate.reasons.push(reason('manual-review'));
  candidate.requiresForce = candidate.classification !== 'merged' && candidate.unmergedCommitCount !== 0;
  candidate.selectedByDefault = candidate.classification === 'merged' && !candidate.blocks.length;
}

function decorateServer(candidate: BranchCleanupCandidate, remote: CleanupRemoteState, input: CleanupAnalysisInput, candidates: BranchCleanupCandidate[]) {
  const name = candidate.name;
  candidate.remoteName = remote.endpoint.remoteName;
  candidate.endpoint = remote.endpoint.url;
  const locals = input.local.branches.filter((branch) => cleanupLocalLinks(branch, remote, name, input.preferences.pushBranches ?? {}));
  candidate.linkedLocalIds = candidates
    .filter((entry) => entry.kind === 'local' && locals.some((branch) => branch.name === entry.name))
    .map((entry) => entry.id);
  candidate.worktrees = input.local.worktrees.filter((worktree) => locals.some((branch) => branch.name === worktree.branch)).map((worktree) => worktree.path);
  if (candidate.worktrees.length || locals.some((branch) => branch.name === input.local.current))
    candidate.blocks.push(reason('local-work', candidate.worktrees.join('\n')));
  if (!remote.complete) candidate.blocks.push(reason('remote-unavailable', remote.problem));
  if (!cleanupMetadataKnown(remote, name)) candidate.blocks.push(reason('unknown-protection', remote.problem));
  if (!remote.endpoint.canIsolate) candidate.blocks.push(reason('endpoint-isolation'));
  if (remote.metadata?.branches.some((entry) => entry.name === name && entry.protected === true)) candidate.blocks.push(reason('protected'));
  const requests = cleanupOpenRequests(remote, name);
  if (requests.length) candidate.blocks.push(reason('open-request', requests.join(', ')));
  if (
    candidate.classification !== 'merged' &&
    !locals.length &&
    !requests.length &&
    candidate.lastCommitAt !== null &&
    candidate.lastCommitAt <= input.now - 90 * 86_400_000
  ) {
    candidate.classification = 'orphaned';
    candidate.reasons.push(reason('inactive', '90'));
  }
  if (candidate.classification === 'other') candidate.blocks.push(reason('not-candidate'));
  candidate.requiresForce = candidate.classification === 'orphaned';
}

export async function analyzeBranchCleanup(git: CleanupGit, repo: string, input: CleanupAnalysisInput, context: CleanupContext): Promise<CleanupAnalysis> {
  const { targets, comparisons } = await makeTargets(git, repo, input);
  const candidates: BranchCleanupCandidate[] = [];
  const dates = await commitDates(git, repo, input);
  const protectedNames = new Set(input.remotes.flatMap((remote) => [remote.defaultBranch, remote.metadata?.defaultBranch ?? '']).filter(Boolean));
  for (const comparison of comparisons) {
    const target = targets.find((entry) => entry.id === comparison.targetId);
    if (target) protectedNames.add(target.branch);
  }
  const targetFor = (comparisonId: string) =>
    targets.find((target) => target.id === comparisons.find((comparison) => comparison.id === comparisonId)?.targetId);
  const base = async (kind: 'local' | 'server', name: string, oid: string, comparisonId: string): Promise<BranchCleanupCandidate> => {
    context.ensureActive();
    const target = targetFor(comparisonId);
    const count = await countOutside(git, repo, oid, target, input.local.incomplete);
    const proof = count !== 0 && !input.local.incomplete ? await mergedRequestProof(git, repo, name, oid, target, input.remotes) : '';
    const merged = count === 0 || Boolean(proof);
    const candidate: BranchCleanupCandidate = {
      id: cleanupDigest([kind, comparisonId, name]).slice(0, 32),
      kind,
      name,
      ref: `refs/heads/${name}`,
      oid,
      comparisonId,
      targetId: target?.id ?? null,
      lastCommitAt: dates.get(oid) ?? null,
      unmergedCommitCount: count,
      classification: merged ? 'merged' : 'other',
      reasons: merged ? [reason(proof ? 'merged-request' : 'merged', proof || target?.name)] : [],
      blocks: [],
      worktrees: [],
      requiresForce: false,
      selectedByDefault: false,
      linkedLocalIds: [],
    };
    if (!target) candidate.blocks.push(reason('missing-target'));
    if (input.local.incomplete || (target && count === null)) candidate.blocks.push(reason('incomplete-history'));
    if (input.local.operation) candidate.blocks.push(reason('operation', input.local.operation));
    if (protectedNames.has(name) || input.patterns.some((pattern) => cleanupPatternMatches(name, pattern))) candidate.blocks.push(reason('protected'));
    return candidate;
  };

  context.progress('branches');
  for (const branch of input.local.branches) {
    const candidate = await base('local', branch.name, branch.oid, 'local');
    decorateLocal(candidate, branch, input);
    candidates.push(candidate);
  }
  for (const remote of input.remotes.filter((entry) => entry.endpoint.canDelete)) {
    for (const [name, oid] of remote.heads) {
      const candidate = await base('server', name, oid, remote.endpoint.id);
      decorateServer(candidate, remote, input, candidates);
      candidates.push(candidate);
    }
  }
  return {
    local: input.local,
    remotes: input.remotes,
    candidates,
    targets,
    comparisons,
    fingerprint: input.fingerprint,
    warnings: input.remotes.filter((remote) => remote.problem).map((remote) => `${remote.endpoint.remoteName} (${remote.endpoint.url}): ${remote.problem}`),
  };
}
