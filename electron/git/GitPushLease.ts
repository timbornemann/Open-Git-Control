import { gitConfigurationEntries } from './GitConfigurationEntries';
import { completeForcePushDestinations } from './GitPushDestination';

type ReadGit = (args: string[]) => Promise<string>;
const leasePrefix = '--force-with-lease=';
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

/** A single local ref snapshot keeps background fetches out of the expected values. */
async function localReferences(read: ReadGit): Promise<Map<string, string>> {
  const raw = await read(['for-each-ref', '--format=%(refname)%00%(objectname)']);
  return new Map(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [ref, oid] = line.split('\0');
        if (!ref.startsWith('refs/') || !objectId.test(oid ?? '')) throw new Error('Could not snapshot push references.');
        return [ref, oid];
      }),
  );
}

function mapReference(ref: string, pattern: string, destination: string): string | undefined {
  if (!pattern.includes('*')) return ref === pattern ? destination : undefined;
  const [prefix, suffix] = pattern.split('*');
  if (!ref.startsWith(prefix) || !ref.endsWith(suffix) || ref.length < prefix.length + suffix.length) return undefined;
  return destination.replace('*', ref.slice(prefix.length, suffix ? -suffix.length : undefined));
}

function destinations(refspecs: string[], local: Map<string, string>): Set<string> {
  const refs = new Set<string>();
  for (const refspec of refspecs) {
    if (refspec === ':') {
      for (const ref of local.keys()) if (ref.startsWith('refs/heads/')) refs.add(ref);
      continue;
    }
    const [source, destination] = refspec.split(':');
    if (!destination?.startsWith('refs/')) throw new Error('Force-with-lease needs a fully qualified push destination.');
    if (source.includes('*')) {
      for (const ref of local.keys()) {
        const mapped = mapReference(ref, source, destination);
        if (mapped) refs.add(mapped);
      }
    } else refs.add(destination);
  }
  return refs;
}

/** Resolve implicit expectations before the renderer opens any approval dialog. */
export async function pinPushLeases(args: string[], read: ReadGit): Promise<string[]> {
  const separator = args.indexOf('--');
  const remote = args[separator + 1];
  const options = args.slice(1, separator).filter((arg) => !['--no-mirror', '--no-force'].includes(arg));
  const leases = options.filter((arg) => arg === '--force-with-lease' || arg.startsWith(leasePrefix));
  if (!leases.length) throw new Error('A force-with-lease push is required.');
  const config = gitConfigurationEntries(await read(['config', '--null', '--list']));
  const local = await localReferences(read);
  const refspecs = await completeForcePushDestinations(
    args.slice(separator + 2),
    remote,
    config.some(([key]) => key === `remote.${remote}.url`),
    read,
  );
  const targets = destinations(refspecs, local);
  // Freeze follow-tags as well, including a configured default, while retaining Git's reachability selection.
  const followTags =
    options.includes('--follow-tags') ||
    (!options.includes('--no-follow-tags') &&
      config.some(([key]) => key === 'push.followtags') &&
      (await read(['config', '--type=bool', '--get', 'push.followTags'])).trim() === 'true');
  if (followTags) for (const ref of local.keys()) if (ref.startsWith('refs/tags/')) targets.add(ref);
  const fetchSpecs = config.filter(([key]) => key === `remote.${remote}.fetch`).map(([, value]) => value.replace(/^\+/, ''));
  const expected = (ref: string): string => {
    if (remote === '.') return local.get(ref) ?? '';
    for (const spec of fetchSpecs) {
      const [source, destination] = spec.split(':');
      if (!destination || source.startsWith('^')) continue;
      const tracking = mapReference(ref, source, destination);
      if (tracking !== undefined) return local.get(tracking) ?? '';
    }
    return '';
  };
  const pinned = new Map<string, string>();
  if (leases.includes('--force-with-lease')) for (const ref of targets) pinned.set(ref, expected(ref));
  for (const lease of leases) {
    if (lease !== '--force-with-lease') {
      const value = lease.slice(leasePrefix.length);
      const colon = value.indexOf(':');
      const name = colon < 0 ? value : value.slice(0, colon);
      const ref = name.startsWith('refs/') ? name : [...targets].find((target) => target === `refs/heads/${name}` || target === `refs/tags/${name}`);
      if (!ref) throw new Error('Force-with-lease needs an explicit destination ref.');
      const oid = colon < 0 ? expected(ref) : value.slice(colon + 1);
      if (oid && !objectId.test(oid)) throw new Error('Force-with-lease requires a full expected object ID.');
      pinned.set(ref, oid);
    }
  }
  // No refs to push is still a normal Git error/no-op; never fall back to implicit expectations.
  const flags = options.filter((arg) => !leases.includes(arg) && !['--follow-tags', '--no-follow-tags'].includes(arg));
  return [
    'push',
    ...flags,
    followTags ? '--follow-tags' : '--no-follow-tags',
    ...[...pinned].map(([ref, oid]) => `${leasePrefix}${ref}:${oid}`),
    remote,
    ...refspecs,
  ];
}

export async function assertExplicitPushLeases(args: string[], read: ReadGit): Promise<void> {
  const separator = args.indexOf('--');
  const options = args.slice(1, separator);
  const leases = options.filter((arg) => arg === '--force-with-lease' || arg.startsWith(leasePrefix));
  if (!leases.length) return;
  const protectedRefs = new Set<string>();
  for (const lease of leases) {
    const match = /^--force-with-lease=(refs\/[^\s:]+):((?:[0-9a-f]{40}|[0-9a-f]{64})?)$/i.exec(lease);
    if (!match) throw new Error('Prepare the force push before confirmation. An explicit destination and expected object ID are required.');
    protectedRefs.add(match[1]);
  }
  const refs = args.slice(separator + 2);
  if (refs.some((ref) => ref === ':' || ref.includes('*')) || options.includes('--follow-tags')) {
    const local = await localReferences(read);
    const targets = destinations(refs, local);
    if (options.includes('--follow-tags')) for (const ref of local.keys()) if (ref.startsWith('refs/tags/')) targets.add(ref);
    for (const ref of targets) {
      if (!protectedRefs.has(ref)) throw new Error('Push references changed after preparation. Prepare and confirm the force push again.');
    }
  }
}
