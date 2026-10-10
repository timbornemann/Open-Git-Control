/**
 * Safe for diagnostics, copy and reports in both Electron and the renderer.
 *
 * This runs on every streamed fetch/pull/push line, including `remote:`
 * messages chosen by the Git server, so each pattern must stay linear: the
 * URL scheme is length-bounded and the scp-style user part cannot span its
 * own delimiters. Unbounded variants rescanned the rest of the line from every
 * position and let a single long line block the main process for minutes.
 */
export function redactGitCredentials(value: unknown): string {
  return String(value ?? '')
    .replace(/([a-z][a-z0-9+.-]{0,31}:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(/(^|[\s'"(])[^\s/@:'"(]+@([a-z0-9.-]+):([^\s'"),]+)/gi, '$1[REDACTED]@$2:$3')
    .replace(
      /([?&](?:[a-z0-9_-]*(?:token|secret|password|passwd|credential|signature)|api[_-]?key|key|auth(?:orization)?|code|ticket|sig|sas)=)[^&#\s'"]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:github_pat_[a-z0-9_-]+|gh[a-z]+_[a-z0-9_-]+|glpat-[a-z0-9_-]+|sk-[a-z0-9_-]+)\b/gi, '[REDACTED]')
    .replace(/\b(bearer|token|basic)\s+[a-z0-9._~+\/=:-]{8,}\b/gi, '$1 [REDACTED]');
}
