import type { CommitEditGit } from './CommitEditGit';
import { CHECK_PREFIX, CommitEditBlockedError } from './commitMessageEditInspection';

export async function verifyUnpublished(
  git: CommitEditGit,
  repo: string,
  hash: string,
  operationId: string,
  signal: AbortSignal,
  timeoutMs = 60_000,
): Promise<void> {
  const names = (await git.run(repo, ['remote'])).split('\n').filter(Boolean);
  const targets = new Set<string>();
  for (const name of names) {
    for (const flags of [[], ['--push']]) {
      const urls = await git.run(repo, ['remote', 'get-url', ...flags, '--all', name]);
      for (const url of urls.split('\n').filter(Boolean)) {
        if (url.startsWith('-') || /[\0\r\n]/.test(url) || /^[a-z][a-z0-9+.-]*::/i.test(url))
          throw new Error('Unsupported remote URL for publication verification.');
        targets.add(url);
      }
    }
  }
  let index = 0;
  for (const url of targets) {
    signal.throwIfAborted();
    const prefix = `${CHECK_PREFIX}${operationId}/${index++}/`;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const options = { signal: controller.signal, envOverrides: { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } };
      const advertised = await git.run(repo, ['ls-remote', '--refs', '--heads', '--tags', url], options);
      // Explicit refspecs inspect every branch and tag, even for single-branch
      // clones or a separate push URL. User refs and FETCH_HEAD stay untouched.
      await git.run(
        repo,
        [
          '-c',
          'fetch.writeCommitGraph=false',
          'fetch',
          '--no-tags',
          '--no-write-fetch-head',
          '--no-recurse-submodules',
          '--no-auto-maintenance',
          '--refmap=',
          url,
          `+refs/heads/*:${prefix}heads/*`,
          `+refs/tags/*:${prefix}tags/*`,
        ],
        options,
      );
      if ((await git.run(repo, ['rev-parse', '--is-shallow-repository'], options)) === 'true') throw new CommitEditBlockedError('incomplete');
      const expected = advertised
        .split('\n')
        .filter(Boolean)
        .map((line) => line.replace(/\s+refs\//, ' '))
        .sort()
        .join('\n');
      const fetched = (await git.run(repo, ['for-each-ref', '--format=%(objectname) %(refname)', prefix], options))
        .split('\n')
        .filter(Boolean)
        .map((line) => line.replace(prefix, ''))
        .sort()
        .join('\n');
      if (fetched !== expected) throw new CommitEditBlockedError('incomplete', 'Remote refs changed or could not be fetched completely.');
      const containing = await git.run(repo, ['for-each-ref', `--contains=${hash}`, '--format=%(refname)', prefix], options);
      if (containing) throw new CommitEditBlockedError('published', 'A remote branch or tag contains this commit.');
    } catch (error) {
      if (!signal.aborted && controller.signal.aborted) throw new Error('Remote verification timed out. No commit was changed.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      await removeCheckRefs(git, repo, prefix);
    }
  }
}

export async function removeCheckRefs(git: CommitEditGit, repo: string, prefix: string) {
  const refs = await git.run(repo, ['for-each-ref', '--format=%(refname) %(objectname)', prefix], { ignoreAbort: true });
  const lines = refs
    .split('\n')
    .filter(Boolean)
    .map((line) => `delete ${line}`);
  if (lines.length) await git.input(repo, ['update-ref', '--stdin'], `${lines.join('\n')}\n`, true);
}
