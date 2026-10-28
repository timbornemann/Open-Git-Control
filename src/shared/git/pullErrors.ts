/** Inspect Git diagnostics only; command operands may contain arbitrary filenames. */
export function isMissingRemoteBranchError(raw: string): boolean {
  const output = raw.includes('Git Output:') ? raw.slice(raw.lastIndexOf('Git Output:') + 11) : raw.replace(/^Command failed:\s*[^\r\n]+\r?\n/i, '');
  return (
    /^\s*fatal:\s+couldn't find remote ref\s+\S+/im.test(output) ||
    /Your configuration specifies to merge with the ref[^\r\n]*\r?\n[^\r\n]*\bbut no such ref was fetched\./i.test(output)
  );
}
