export type GitHubPushProtectionViolation = {
  secretType: string | null;
  commitHash: string | null;
  filePath: string | null;
  lineNumber: number | null;
  unblockUrl: string | null;
};

export type GitHubPushProtectionFailure = {
  violations: GitHubPushProtectionViolation[];
  documentationUrl: string | null;
  securitySettingsUrl: string | null;
};

const urlPattern = /(https:\/\/(?:github\.com|docs\.github\.com)\/[^\s]+)/g;
const unblockUrlPattern = /^https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/security\/secret-scanning\/unblock-secret\/[^\s/]+$/;
const documentationUrlPattern = /^https:\/\/docs\.github\.com\/[^\s]+$/;
const securitySettingsUrlPattern = /^https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/settings\/security_analysis$/;

// The secret type must start and end with a non-dash character. A bare `(.+?)`
// between the two dash runs could split a long dash line in cubically many
// ways; 4 KB of server-sent dashes froze the renderer for over a minute.
const secretTypeLinePattern = /^\s*(?:remote:\s*)?[\u2014-]{2,}\s*([^\s\u2014-](?:.*?[^\s\u2014-])?)\s*[\u2014-]{2,}\s*$/;
const locationLinePattern = /^\s*(?:remote:\s*)?path:\s*(.+?):(\d+)\s*$/;
const MAX_PARSED_LINE_LENGTH = 2_000;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const parseViolation = (message: string, unblockUrl: string | null): GitHubPushProtectionViolation => {
  // Push output is chosen by the remote server; match it line by line so no
  // pattern can scan across lines or through arbitrarily long lines.
  const lines = message.split(/\r?\n/).filter((line) => line.length <= MAX_PARSED_LINE_LENGTH);
  const firstLineMatch = (pattern: RegExp): RegExpExecArray | null => {
    for (const line of lines) {
      const match = pattern.exec(line);
      if (match) return match;
    }
    return null;
  };
  const secretType = firstLineMatch(secretTypeLinePattern)?.[1]?.trim() || null;
  const commitHash = message.match(/\bcommit:\s*([0-9a-f]{7,64})\b/i)?.[1] || null;
  const location = firstLineMatch(locationLinePattern);

  return {
    secretType,
    commitHash,
    filePath: location?.[1]?.trim() || null,
    lineNumber: location ? Number(location[2]) : null,
    unblockUrl,
  };
};

/** Extracts only GitHub's actionable Push Protection metadata. */
export const parseGitHubPushProtectionFailure = (value: unknown): GitHubPushProtectionFailure | null => {
  const message = typeof value === 'string' ? value : '';
  if (!/\bGH013\b/i.test(message) || !/GITHUB PUSH PROTECTION/i.test(message)) return null;

  const urls = unique(Array.from(message.matchAll(urlPattern), (match) => match[1].replace(/[),.]$/, '')));
  const unblockUrls = urls.filter((url) => unblockUrlPattern.test(url));
  const documentationUrl = urls.find((url) => documentationUrlPattern.test(url)) || null;
  const securitySettingsUrl = urls.find((url) => securitySettingsUrlPattern.test(url)) || null;

  return {
    violations: [parseViolation(message, unblockUrls[0] || null)],
    documentationUrl,
    securitySettingsUrl,
  };
};
