import { assertSafeRemoteUrl } from '../main-process/gitCommandArguments';

type ReadGit = (args: string[]) => Promise<string>;

/** Git first matches an unqualified destination against advertised refs, then infers its source namespace. */
export async function completeForcePushDestinations(refspecs: string[], remote: string, configuredRemote: boolean, read: ReadGit): Promise<string[]> {
  let advertised: string[][] | undefined;
  const result: string[] = [];
  for (const refspec of refspecs) {
    if (refspec === ':') {
      result.push(refspec);
      continue;
    }
    const [source, destination] = refspec.split(':');
    if (destination.startsWith('refs/')) {
      result.push(refspec);
      continue;
    }
    if (!advertised) {
      const urls = configuredRemote ? (await read(['remote', 'get-url', '--push', '--all', remote])).trim().split(/\r?\n/) : [remote];
      advertised = [];
      for (const url of new Set(urls)) {
        assertSafeRemoteUrl(url);
        const raw = await read(['ls-remote', '--refs', '--', url]);
        advertised.push(
          raw
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
              const [oid, ref] = line.split('\t');
              if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(oid) || !ref?.startsWith('refs/')) throw new Error('Could not resolve the push destination.');
              return ref;
            }),
        );
      }
    }
    const candidates = ['', 'refs/', 'refs/tags/', 'refs/heads/', 'refs/remotes/'].map((prefix) => `${prefix}${destination}`);
    candidates.push(`refs/remotes/${destination}/HEAD`);
    const resolved = new Set<string>();
    for (const refs of advertised) {
      const matches = refs.filter((ref) => candidates.includes(ref));
      if (matches.length > 1) throw new Error('The push destination is ambiguous. Specify a fully qualified destination ref.');
      if (matches.length === 1) resolved.add(matches[0]);
      else {
        const full = (await read(['rev-parse', '--verify', '--symbolic-full-name', source])).trim();
        const namespace = /^(refs\/(?:heads|tags)\/)/.exec(full)?.[1];
        if (!namespace) throw new Error('Force-with-lease needs a fully qualified push destination.');
        resolved.add(`${namespace}${destination}`);
      }
    }
    if (resolved.size !== 1) throw new Error('Push endpoints resolve different destinations. Specify a fully qualified destination ref.');
    result.push(`${source}:${[...resolved][0]}`);
  }
  return result;
}
