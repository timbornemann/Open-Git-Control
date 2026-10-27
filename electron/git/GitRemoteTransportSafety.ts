const REMOTE_PROTOCOLS = new Set(['http', 'https', 'ssh', 'git', 'file', 'ftp', 'ftps', 'git+ssh', 'ssh+git']);

/** Match Git's URL grammar, which also accepts digit-prefixed and empty helper names. */
export function assertSafeGitRemoteTransport(value: string, helperMessage = 'Git remote-helper URLs are not allowed.'): void {
  if (/^(?:[a-z0-9][a-z0-9+.-]*)?::/i.test(value)) throw new Error(helperMessage);
  const scheme = /^([a-z0-9][a-z0-9+.-]*):\/\//i.exec(value)?.[1].toLowerCase();
  if (scheme && !REMOTE_PROTOCOLS.has(scheme)) throw new Error('Unsupported Git remote transport.');
}
