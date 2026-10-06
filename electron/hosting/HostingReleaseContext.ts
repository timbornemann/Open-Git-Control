import type { GitService } from '../GitService';
import type { HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import type { ReleaseContext } from '../../src/types/releaseNotes';
import type { HostingService } from './HostingService';
import { requireActiveRepositoryPath } from '../main-process/activeRepositoryAuthorization';
import { repoJobRegistry } from '../main-process/repoJobRegistry';
import { hasControlCharacters } from './hostingUrls';
import { releaseEndpointResolver, releaseCredentialUrls } from './HostingReleaseEndpoint';
import { parseReleaseCommits, RELEASE_COMMIT_FORMAT } from '../main-process/parsing';

const oidPattern = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i;
const revision = (value: string) => {
  if (!value || value.length > 2000 || value.startsWith('-') || hasControlCharacters(value)) throw new Error('A valid release revision is required.');
  return value;
};

/** Loads history against this endpoint's tag OIDs; local tags may belong to a backup. */
export async function getHostingReleaseContext(
  input: HostingOperations['releaseContext']['input'],
  gitService: GitService,
  hostingService: HostingService,
): Promise<ReleaseContext> {
  const repoPath = requireActiveRepositoryPath(input.repoPath, gitService.getRepoPath(), 'hosting:releaseContext');
  hostingService.validateRepository(input.repository);
  const generation = hostingService.generation(input.repository.connectionId);
  const repoGeneration = repoJobRegistry.getGeneration();
  const job = repoJobRegistry.begin(repoPath);
  const signal = AbortSignal.any([job.signal, hostingService.getConnectionSignal(input.repository.connectionId)]);
  const assertCurrent = () => {
    requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), 'hosting:releaseContext');
    if (generation !== hostingService.generation(input.repository.connectionId) || repoGeneration !== repoJobRegistry.getGeneration())
      throw new Error('The repository or hosting account changed while loading release history.');
  };
  try {
    const adapter = await hostingService.authenticatedAdapter(input.repository.connectionId);
    const [repository, releases] = await Promise.all([
      adapter.repository({ repository: input.repository }),
      adapter.releases({ repository: input.repository }),
    ]);
    if (
      repository.ref.connectionId !== input.repository.connectionId ||
      repository.ref.repositoryId !== input.repository.repositoryId ||
      repository.ref.fullPath !== input.repository.fullPath
    )
      throw new Error('The hosting repository identity changed while loading release history.');
    const existingTags: string[] = [];
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
      assertCurrent();
      const page = await adapter.tags({ repository: input.repository, cursor });
      existingTags.push(...page.items);
      if (!page.nextCursor) break;
      if (pageIndex === 99) throw new Error('Too many tag pages to safely load the release context.');
      cursor = page.nextCursor;
    }
    assertCurrent();
    return await gitService.runner.withExclusiveWrite(
      repoPath,
      'hosting-release-context',
      async (git) => {
        const read = async (args: string[], network = false) => {
          assertCurrent();
          const urls = network ? releaseCredentialUrls(repoPath, input.remoteName, args) : [];
          const credential =
            network && urls.length ? await hostingService.createGitCredentialEnvironment({ connectionId: input.repository.connectionId, urls, signal }) : null;
          try {
            const value = await git.run(repoPath, args, {
              signal: AbortSignal.any([credential?.signal || signal, AbortSignal.timeout(60_000)]),
              envOverrides: credential?.envOverrides || { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
            });
            assertCurrent();
            return value.trim();
          } finally {
            credential?.dispose();
          }
        };
        revision(input.remoteName);
        const fetch = await read(['remote', 'get-url', input.remoteName]);
        const push = (await read(['remote', 'get-url', '--push', '--all', input.remoteName])).split(/\r?\n/).filter(Boolean);
        const resolver = releaseEndpointResolver(repoPath, input.remoteName, input.repository, adapter);
        let endpoint = '';
        for (const url of [fetch, ...push]) {
          const matches = await resolver.matches(url);
          assertCurrent();
          if (matches) {
            endpoint = url;
            break;
          }
        }
        if (!endpoint) throw new Error('The selected remote has no endpoint for this hosted repository.');
        const advertised = async (ref: string) => {
          const raw = await read(['ls-remote', '--', endpoint, ref, `${ref}^{}`], true);
          const refs = new Map(
            raw
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => {
                const [oid, name] = line.split(/\s+/);
                return [name, oid];
              }),
          );
          return refs.get(`${ref}^{}`) || refs.get(ref) || null;
        };
        const acquire = async (oid: string, ref: string) => {
          if (!oidPattern.test(oid)) throw new Error('The hosting endpoint returned an invalid commit ID.');
          const exists = await read(['cat-file', '-e', `${oid}^{commit}`]).then(
            () => true,
            () => false,
          );
          if (!exists)
            await read(
              ['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--no-auto-maintenance', '--refmap=', '--', endpoint, ref],
              true,
            );
          if ((await advertised(ref)) !== oid) throw new Error('The release reference changed while loading history. Refresh the context.');
          return read(['rev-parse', '--verify', '--end-of-options', `${oid}^{commit}`]);
        };
        const target = revision(input.target);
        let targetOid = await read(['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`]).catch(() => '');
        const isLocalTag = await read(['show-ref', '--verify', target.startsWith('refs/tags/') ? target : `refs/tags/${target}`]).then(
          () => true,
          () => false,
        );
        const isLocalBranch = await read(['show-ref', '--verify', `refs/heads/${target.replace(/^refs\/heads\//, '')}`]).then(
          () => true,
          () => false,
        );
        if (!targetOid || target.startsWith('refs/tags/') || (isLocalTag && !isLocalBranch)) {
          const ref = target.startsWith('refs/') ? target : `refs/heads/${target}`;
          let oid = await advertised(ref);
          let selectedRef = ref;
          if (!oid && !target.startsWith('refs/')) {
            selectedRef = `refs/tags/${target}`;
            oid = await advertised(selectedRef);
          }
          if (oid) targetOid = await acquire(oid, selectedRef);
          else targetOid = '';
        }
        if (!targetOid) throw new Error('The release target is not available locally or on the selected endpoint.');
        const lastReleaseTag = releases.items.find((release) => release.tagName && !release.draft)?.tagName || null;
        const baseline = input.fromRef ? revision(input.fromRef) : lastReleaseTag;
        let previous: string | null = null;
        let fallbackUsed = false;
        if (baseline) {
          const ref = baseline.startsWith('refs/') ? baseline : `refs/tags/${baseline}`;
          const oid = await advertised(ref);
          if (oid) previous = await acquire(oid, ref);
          else if (input.fromRef) {
            previous = await read(['rev-parse', '--verify', '--end-of-options', `${baseline}^{commit}`]);
          } else fallbackUsed = true;
        }
        if ((await read(['rev-parse', '--is-shallow-repository'])) === 'true') {
          previous = null;
          fallbackUsed = true;
        }
        const limit = previous ? 400 : 150;
        const raw = await read(['log', `--max-count=${limit + 1}`, RELEASE_COMMIT_FORMAT, previous ? `${previous}..${targetOid}` : targetOid, '--']);
        const commits = parseReleaseCommits(raw);
        resolver.assertCurrent();
        assertCurrent();
        return {
          existingTags: [...new Set(existingTags)],
          lastReleaseTag,
          repositoryHtmlUrl: repository.htmlUrl,
          commitsTarget: target,
          targetOid,
          fallbackUsed,
          warning: commits.length > limit ? `Only the latest ${limit} commits are included in the release context.` : undefined,
          commitsSinceLastRelease: commits.slice(0, limit),
        };
      },
      signal,
    );
  } finally {
    job.complete();
  }
}
