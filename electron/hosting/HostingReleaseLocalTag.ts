import type { HostingLocalReleaseTag } from '../../src/types/hostingDtos';
import { redactGitSensitiveText } from '../git/GitErrorFormatter';

type Git = (args: string[], network?: boolean) => Promise<string>;

/** Creates only this tag at the verified publication commit, without replacing any existing ref. */
export async function createHostingReleaseLocalTag(git: Git, name: string, targetOid: string, endpoint: string): Promise<HostingLocalReleaseTag> {
  const result = { name, targetOid };
  const ref = `refs/tags/${name}`;
  const existing = async (): Promise<HostingLocalReleaseTag | null> => {
    const oid = (await git(['rev-parse', '--verify', `${ref}^{commit}`]).catch(() => '')).trim();
    if (!oid) return null;
    return oid === targetOid
      ? { ...result, status: 'existing' }
      : {
          ...result,
          status: 'conflict',
          message: 'The existing local tag points to a different commit. Resolve the local tag conflict before retrying; the tag was not overwritten.',
        };
  };
  try {
    await git(['check-ref-format', ref]);
    const found = await existing();
    if (found) return found;
    // A release may use a remote commit which has never been checked out locally.
    if (
      !(await git(['cat-file', '-e', `${targetOid}^{commit}`]).then(
        () => true,
        () => false,
      ))
    )
      await git(['fetch', '--no-tags', '--no-write-fetch-head', '--', endpoint, targetOid], true);
    await git(['update-ref', '-m', `Release ${name}`, ref, targetOid, '0'.repeat(targetOid.length)]);
    return { ...result, status: 'created' };
  } catch (reason) {
    // A concurrent writer can win the create-only compare-and-swap. Preserve its tag.
    const found = await existing();
    return (
      found || {
        ...result,
        status: 'failed',
        message: redactGitSensitiveText(reason instanceof Error ? reason.message : 'The local release tag could not be created.'),
      }
    );
  }
}
