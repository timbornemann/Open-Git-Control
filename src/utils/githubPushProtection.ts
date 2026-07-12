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

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const parseViolation = (message: string, unblockUrl: string | null): GitHubPushProtectionViolation => {
  const secretType = message.match(/^\s*(?:remote:\s*)?(?:\u2014|-){2,}\s*(.+?)\s*(?:\u2014|-){2,}\s*$/m)?.[1]?.trim() || null;
  const commitHash = message.match(/\bcommit:\s*([0-9a-f]{7,64})\b/i)?.[1] || null;
  const location = message.match(/^\s*(?:remote:\s*)?path:\s*(.+?):(\d+)\s*$/m);

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
