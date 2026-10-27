type ReadGit = (args: string[]) => Promise<string>;

/** Prepared pushes must scan their explicit wildcard/matching sources, including branches other than HEAD. */
export async function expandPushScanSources(sources: string[], matching: boolean, args: string[], read: ReadGit): Promise<string[]> {
  if (!matching && sources.every((source) => !source.includes('*'))) return [...new Set(sources)];
  // Enumeration errors must block the scan, rather than turn a wildcard into an empty history.
  const local = (await read(['for-each-ref', '--format=%(refname)'])).split(/\r?\n/).filter(Boolean);
  const leases = args.filter((arg) => arg.startsWith('--force-with-lease='));
  const knownMatchingTargets = new Set(
    leases.flatMap((lease) => /^--force-with-lease=(refs\/heads\/[^:]+):(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.exec(lease)?.[1] ?? []),
  );
  const revisions = new Set<string>();
  for (const source of sources) {
    if (!source.includes('*')) revisions.add(source);
    else {
      const [prefix, suffix] = source.split('*');
      for (const ref of local) if (ref.length >= prefix.length + suffix.length && ref.startsWith(prefix) && ref.endsWith(suffix)) revisions.add(ref);
    }
  }
  if (matching) {
    // An absent expected ref cannot be updated by matching: an intervening creation fails its lease.
    for (const ref of local) if (ref.startsWith('refs/heads/') && (!leases.length || knownMatchingTargets.has(ref))) revisions.add(ref);
  }
  return [...revisions];
}
