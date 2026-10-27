import { gitConfigurationEntries } from './GitConfigurationEntries';
import { safePushRefspec } from './GitRefspecSafety';
import { assertSafeRemoteUrl } from '../main-process/gitCommandArguments';
import { assertExplicitPushLeases, pinPushLeases } from './GitPushLease';

type ReadGit = (args: string[]) => Promise<string>;

/** Resolve defaults locally, then keep remote.push and remote.mirror out of the executed push. */
async function resolvePushArguments(args: string[], read: ReadGit): Promise<string[]> {
  const entries = gitConfigurationEntries(await read(['config', '--null', '--list']));
  const all = (key: string) => entries.filter(([name]) => name === key.replace(/\.[^.]+$/, (variable) => variable.toLowerCase())).map(([, value]) => value);
  const get = (key: string) => all(key).at(-1) ?? '';
  const optional = async (query: string[]) => {
    try {
      return (await read(query)).trim();
    } catch {
      return '';
    }
  };
  const branchRef = await optional(['symbolic-ref', '--quiet', 'HEAD']);
  const branch = branchRef.startsWith('refs/heads/') ? branchRef.slice('refs/heads/'.length) : '';
  const branchRemote = branch ? get(`branch.${branch}.remote`) : '';
  const remotes = [...new Set(entries.flatMap(([key]) => /^remote\.(.+)\.url$/.exec(key)?.[1] ?? []))];
  const fetchRemote = branchRemote || (remotes.length === 1 ? remotes[0] : 'origin');
  const options = args.filter((arg) => arg.startsWith('-') && arg !== '--tags');
  const values = args.filter((arg) => !arg.startsWith('-'));
  const remote = values[0] || (branch && get(`branch.${branch}.pushRemote`)) || get('remote.pushDefault') || fetchRemote;
  assertSafeRemoteUrl(remote);
  const configured = all(`remote.${remote}.push`);

  const symbolicSource = async (source: string) => {
    const full = await optional(['rev-parse', '--verify', '--symbolic-full-name', source]);
    if (!full.startsWith('refs/') || /[\s:]/.test(full)) throw new Error('Push source needs an explicit destination ref.');
    return full;
  };
  const mapSource = async (source: string): Promise<string> => {
    const full = await symbolicSource(source);
    const namedRef = [full, full.slice('refs/'.length), full.replace(/^refs\/(?:heads|tags|remotes)\//, '')].includes(source);
    // HEAD and revision expressions are not entries in Git's local ref list and skip its mapping lookup.
    if (!namedRef) return full;
    for (const configuredRef of configured) {
      const ref = configuredRef.replace(/^\+/, '');
      const [from, to] = ref.split(':');
      if (!from || !to) continue;
      // Git's configured mapping lookup uses the resolved source ref, not its short name or HEAD alias.
      if (from === full) return to;
      if (from.includes('*') && to.includes('*')) {
        const [prefix, suffix] = from.split('*');
        if (full.startsWith(prefix) && full.endsWith(suffix)) return to.replace('*', full.slice(prefix.length, suffix ? -suffix.length : undefined));
      }
    }
    if (['upstream', 'tracking'].includes(get('push.default')) && full.startsWith('refs/heads/')) {
      const merges = all(`branch.${full.slice('refs/heads/'.length)}.merge`);
      if (merges.length === 1) return merges[0];
    }
    return full;
  };
  const complete = async (value: string, mapped: boolean): Promise<string> => {
    const ref = safePushRefspec(value, true);
    if (ref.includes(':')) return ref;
    if (ref.startsWith('refs/') && ref.includes('*')) return safePushRefspec(`${ref}:${ref}`);
    return safePushRefspec(`${ref}:${await (mapped ? mapSource(ref) : symbolicSource(ref))}`);
  };
  const defaultRefs = async (): Promise<string[]> => {
    const mode = get('push.default') || 'simple';
    if (mode === 'nothing') throw new Error('Push has no explicit refspec and push.default is nothing.');
    if (mode === 'matching') return [':'];
    if (!branch) throw new Error('You are not currently on a branch. Specify a push source and destination.');
    if (!['simple', 'current', 'upstream', 'tracking'].includes(mode)) throw new Error('Unsupported push.default configuration.');
    const merges = all(`branch.${branch}.merge`);
    const upstream = merges.length === 1 ? merges[0] : '';
    const autoSetupRemote =
      merges.length === 0 &&
      all('push.autoSetupRemote').length > 0 &&
      (await read(['config', '--type=bool', '--get', 'push.autoSetupRemote'])).trim() === 'true';
    const upstreamMode = mode === 'upstream' || mode === 'tracking';
    const needsUpstream = upstreamMode || (mode === 'simple' && remote === fetchRemote);
    if (needsUpstream && (!upstream || !branchRemote) && !autoSetupRemote) throw new Error(`The current branch ${branch} has no upstream branch.`);
    if (upstreamMode && remote !== fetchRemote) throw new Error('The selected push remote is not the upstream remote.');
    if (mode === 'simple' && needsUpstream && upstream && upstream !== branchRef)
      throw new Error('The upstream branch does not match the name of your current branch. Specify a push destination.');
    if (merges.length > 1 && needsUpstream) throw new Error('The current branch has multiple upstream branches. Specify a push destination.');
    if (autoSetupRemote) options.push('--set-upstream');
    return [safePushRefspec(`${branchRef}:${upstreamMode && upstream ? upstream : branchRef}`)];
  };

  let refs: string[];
  if (values[1]) {
    refs = await Promise.all(values.slice(1).map((ref) => (ref === ':' ? Promise.resolve(':') : complete(ref, !ref.startsWith('+')))));
  } else if (args.includes('--tags')) {
    refs = ['refs/tags/*:refs/tags/*'];
  } else if (configured.length) {
    // Configured '+' is never inherited; only the explicit lease option may authorize a rewrite.
    refs = await Promise.all(configured.map((ref) => (ref.replace(/^\+/, '') === ':' ? Promise.resolve(':') : complete(ref, false))));
  } else {
    refs = await defaultRefs();
  }
  // The caller also disables remote.<name>.mirror with process-local configuration.
  return ['push', '--no-mirror', '--no-force', ...options, '--', remote, ...refs];
}

export async function prepareForcePushArguments(args: string[], read: ReadGit): Promise<string[]> {
  return pinPushLeases(await resolvePushArguments(args, read), read);
}

export async function explicitPushArguments(args: string[], read: ReadGit): Promise<string[]> {
  const explicit = await resolvePushArguments(args, read);
  await assertExplicitPushLeases(explicit, read);
  return explicit;
}
