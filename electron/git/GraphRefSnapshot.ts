const HASH = /^[0-9a-f]{7,64}$/i;

/** Read only public ref tips. NUL fields preserve names containing commas;
 * for-each-ref also works on Git versions predating %(decorate:...). */
export async function readGraphRefs(execute: (args: string[]) => Promise<string>, headHash?: string): Promise<Record<string, string[]>> {
  const raw = await execute(['for-each-ref', '--format=%(objectname)%00%(objecttype)%00%(*objectname)%00%(*objecttype)%00%(refname)%00%(HEAD)']);
  const refs: Record<string, string[]> = {};
  let attachedHead = false;
  const add = (hash: string, label: string) => {
    if (!HASH.test(hash)) return;
    const labels = (refs[hash] ??= []);
    if (!labels.includes(label)) labels.push(label);
  };
  for (const record of raw.split('\n')) {
    const [hash, type, peeled, peeledType, ref = '', head] = record.replace(/\r$/, '').split('\x00');
    if (!ref.startsWith('refs/heads/') && !ref.startsWith('refs/remotes/') && !ref.startsWith('refs/tags/') && ref !== 'refs/stash') continue;
    let target = type === 'commit' ? hash : type === 'tag' && peeledType === 'commit' ? peeled : '';
    if (type === 'tag' && peeledType === 'tag') {
      // Nested annotated tags are uncommon. Let Git peel these completely,
      // without walking ancestors or issuing a process for every normal tag.
      target = (await execute(['log', '--no-walk', '--no-show-signature', '--format=%H', ref, '--'])).trim();
    }
    if (!target) continue;
    if (ref.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length);
      add(target, head === '*' ? `HEAD -> ${name}` : name);
      attachedHead ||= head === '*';
    } else if (ref.startsWith('refs/remotes/')) add(target, ref.slice('refs/remotes/'.length));
    else if (ref.startsWith('refs/tags/')) add(target, `tag: ${ref.slice('refs/tags/'.length)}`);
    else add(target, ref);
  }
  if (!attachedHead) add((headHash ?? (await execute(['rev-parse', '--verify', 'HEAD']))).trim(), 'HEAD');
  return refs;
}
