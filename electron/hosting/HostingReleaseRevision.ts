export type ReleaseGitReader = (args: string[], network?: boolean) => Promise<string>;
const shaPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;
const parseRefs = (value: string) =>
  new Map(
    value
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [oid, ref] = line.split(/\s+/);
        return [ref, oid];
      }),
  );

/** A named tag belongs to this endpoint. A commit expression must be available on that endpoint too. */
export async function readReleaseRevision(targetInput: string, endpoint: string, git: ReleaseGitReader) {
  const target = targetInput.replace(/^refs\/heads\//, '').replace(/^refs\/tags\//, '');
  const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
  const currentBranch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => '')).trim();
  const refs = parseRefs(await git(['ls-remote', '--', endpoint, `refs/heads/${target}`, `refs/tags/${target}`, `refs/tags/${target}^{}`], true));
  const localBranchExists = await git(['show-ref', '--verify', '--quiet', `refs/heads/${target}`]).then(
    () => true,
    () => false,
  );
  const isBranch = !targetInput.startsWith('refs/tags/') && !shaPattern.test(targetInput) && (localBranchExists || refs.has(`refs/heads/${target}`));
  if (isBranch)
    return {
      target,
      head,
      currentBranch,
      branch: target,
      localSha: localBranchExists ? (await git(['rev-parse', '--verify', `refs/heads/${target}^{commit}`])).trim() : null,
      remoteSha: refs.get(`refs/heads/${target}`) || null,
    };
  const remoteTag = refs.get(`refs/tags/${target}^{}`) || refs.get(`refs/tags/${target}`);
  if (remoteTag) {
    await git(['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--refmap=', '--', endpoint, `refs/tags/${target}`], true);
    const remoteSha = (await git(['rev-parse', '--verify', '--end-of-options', `${remoteTag}^{commit}`])).trim();
    return { target, head, currentBranch, branch: null, localSha: remoteSha, remoteSha };
  }
  const isLocalTag = await git(['show-ref', '--verify', '--quiet', `refs/tags/${target}`]).then(
    () => true,
    () => false,
  );
  const localSha =
    targetInput.startsWith('refs/tags/') || targetInput.startsWith('refs/heads/') || isLocalTag
      ? null
      : (await git(['rev-parse', '--verify', '--end-of-options', `${targetInput}^{commit}`]).catch(() => '')).trim() || null;
  let remoteSha: string | null = null;
  if (localSha) {
    try {
      await git(['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--refmap=', '--', endpoint, localSha], true);
      remoteSha = localSha;
    } catch {
      remoteSha = null;
    }
  }
  return { target, head, currentBranch, branch: null, localSha, remoteSha };
}
