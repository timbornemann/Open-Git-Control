export type SecretScanFindingPath = { filePath: string };

const pathRuleKey = (filePath: string): string => filePath.replace(/\\/g, '/').toLowerCase();

const existingPathRuleKeys = (allowlistText: string): Set<string> => {
  const paths = new Set<string>();
  for (const line of allowlistText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('path:')) continue;
    const filePath = trimmed.slice(5).trim();
    if (filePath) paths.add(pathRuleKey(filePath));
  }
  return paths;
};

/**
 * Adds the narrowest rule available without retaining the detected secret:
 * each affected repository-relative path is added at most once. Newlines are
 * rejected because the allowlist stores one rule per line.
 */
export function addFindingPathsToSecretScanAllowlistText(
  allowlistText: string,
  findings: SecretScanFindingPath[],
): { allowlistText: string; addedPaths: string[] } {
  const existing = existingPathRuleKeys(allowlistText);
  const addedPaths: string[] = [];

  for (const finding of findings) {
    const filePath = String(finding.filePath || '');
    if (!filePath || /[\r\n\0]/.test(filePath) || existing.has(pathRuleKey(filePath))) continue;
    existing.add(pathRuleKey(filePath));
    addedPaths.push(filePath);
  }

  return {
    allowlistText: [allowlistText.trimEnd(), ...addedPaths.map((filePath) => `path:${filePath}`)].filter(Boolean).join('\n'),
    addedPaths,
  };
}
