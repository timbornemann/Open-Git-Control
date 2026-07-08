const SEMVER_TAG_REGEX = /^(v?)(\d+)\.(\d+)\.(\d+)$/i;

export type ReleaseVersionBump = 'major' | 'minor' | 'patch';

type ParsedTag = {
  prefix: string;
  major: number;
  minor: number;
  patch: number;
};

function parseSemverTag(tag: string): ParsedTag | null {
  const match = String(tag || '')
    .trim()
    .match(SEMVER_TAG_REGEX);
  if (!match) return null;

  return {
    prefix: match[1] || 'v',
    major: Number(match[2]),
    minor: Number(match[3]),
    patch: Number(match[4]),
  };
}

export function detectReleaseVersionBump(previousTag: string | null | undefined, nextTag: string): ReleaseVersionBump | null {
  const previous = parseSemverTag(previousTag || '');
  const next = parseSemverTag(nextTag);
  if (!previous || !next) return null;

  if (next.major > previous.major) return 'major';
  if (next.major === previous.major && next.minor > previous.minor) return 'minor';
  if (next.major === previous.major && next.minor === previous.minor && next.patch > previous.patch) {
    return 'patch';
  }

  return null;
}

export function suggestNextReleaseTag(tags: string[], bump: ReleaseVersionBump = 'patch'): string {
  const parsed = (Array.isArray(tags) ? tags : []).map(parseSemverTag).filter((item): item is ParsedTag => Boolean(item));

  if (parsed.length === 0) {
    return bump === 'major' ? 'v1.0.0' : 'v0.1.0';
  }

  parsed.sort((a, b) => {
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    return b.patch - a.patch;
  });

  const top = parsed[0];
  const prefix = top.prefix || 'v';

  if (bump === 'major') {
    return `${prefix}${top.major + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `${prefix}${top.major}.${top.minor + 1}.0`;
  }
  return `${prefix}${top.major}.${top.minor}.${top.patch + 1}`;
}
