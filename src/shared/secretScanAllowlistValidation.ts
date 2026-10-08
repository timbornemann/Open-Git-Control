/** Validate the existing line-based syntax without changing its matching semantics. */
export function validateSecretScanAllowlist(text: string): void {
  if (text.includes('\0')) throw new Error('Secret-scan allowlist cannot contain NUL characters.');
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const rule = line.trim();
    if (!rule || rule.startsWith('#')) continue;
    const lineNumber = index + 1;
    if (rule.startsWith('path:') && !rule.slice(5).trim()) throw new Error(`Empty path rule on allowlist line ${lineNumber}.`);
    if (!rule.startsWith('regex:')) continue;
    const pattern = rule.slice(6).trim();
    if (!pattern) throw new Error(`Empty regex rule on allowlist line ${lineNumber}.`);
    try {
      new RegExp(pattern, 'i');
    } catch {
      // Do not echo patterns: hand-written rules may contain secret literals.
      throw new Error(`Invalid regex rule on allowlist line ${lineNumber}.`);
    }
  }
}
