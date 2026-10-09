/** Safe for diagnostics, copy and reports in both Electron and the renderer. */
export function redactGitCredentials(value: unknown): string {
  return String(value ?? '')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
    .replace(/(^|[\s'"(])[^\s/@:]+@([a-z0-9.-]+):([^\s'"),]+)/gi, '$1[REDACTED]@$2:$3')
    .replace(
      /([?&](?:[a-z0-9_-]*(?:token|secret|password|passwd|credential|signature)|api[_-]?key|key|auth(?:orization)?|code|ticket|sig|sas)=)[^&#\s'"]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:github_pat_[a-z0-9_-]+|gh[a-z]+_[a-z0-9_-]+|glpat-[a-z0-9_-]+|sk-[a-z0-9_-]+)\b/gi, '[REDACTED]')
    .replace(/\b(bearer|token|basic)\s+[a-z0-9._~+\/=:-]{8,}\b/gi, '$1 [REDACTED]');
}
