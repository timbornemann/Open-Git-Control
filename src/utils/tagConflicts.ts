export const TAG_REFERENCE_STATUS_FORMAT = '--format=%(refname)%00%(objectname)%00%(*objectname)';

const LOCAL_TAG_PREFIX = 'refs/tags/';

export const remoteTagTrackingRefPrefix = (remote: string): string => `refs/ogc/remote-tags/${remote}/`;

/**
 * Returns local tag names whose peeled commit differs from the matching tag
 * stored by the safe remote-tag tracker. Annotated and lightweight tags are
 * both reduced to their commit object before they are compared.
 */
type TagReferenceStatus = {
  conflictingTagNames: string[];
  remoteOnlyTagNames: string[];
};

export function parseTagReferenceStatus(raw: unknown, remote: string | null): TagReferenceStatus {
  if (!remote) return { conflictingTagNames: [], remoteOnlyTagNames: [] };

  const remotePrefix = remoteTagTrackingRefPrefix(remote);
  const localTargets = new Map<string, string>();
  const remoteTargets = new Map<string, string>();

  for (const record of String(raw || '').split(/\r?\n/)) {
    if (!record) continue;
    const [refName = '', objectName = '', peeledObjectName = ''] = record.split('\0');
    const target = (peeledObjectName || objectName).trim();
    if (!/^[0-9a-f]{40,64}$/i.test(target)) continue;

    if (refName.startsWith(LOCAL_TAG_PREFIX)) {
      localTargets.set(refName.slice(LOCAL_TAG_PREFIX.length), target);
      continue;
    }
    if (refName.startsWith(remotePrefix)) {
      remoteTargets.set(refName.slice(remotePrefix.length), target);
    }
  }

  const conflictingTagNames = [...localTargets]
    .filter(([tagName, localTarget]) => {
      const remoteTarget = remoteTargets.get(tagName);
      return Boolean(remoteTarget && remoteTarget !== localTarget);
    })
    .map(([tagName]) => tagName)
    .sort((left, right) => left.localeCompare(right));
  const remoteOnlyTagNames = [...remoteTargets.keys()].filter((tagName) => !localTargets.has(tagName)).sort((left, right) => left.localeCompare(right));

  return { conflictingTagNames, remoteOnlyTagNames };
}

export function parseConflictingTagNames(raw: unknown, remote: string | null): string[] {
  return parseTagReferenceStatus(raw, remote).conflictingTagNames;
}
