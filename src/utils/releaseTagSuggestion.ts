const SEMVER_TAG_REGEX = /^(v?)(\d+)\.(\d+)\.(\d+)$/i;

type ParsedTag = {
  prefix: string;
  major: number;
  minor: number;
  patch: number;
};

function parseSemverTag(tag: string): ParsedTag | null {
  const match = String(tag || '').trim().match(SEMVER_TAG_REGEX);
  if (!match) return null;

  return {
    prefix: match[1] || 'v',
    major: Number(match[2]),
    minor: Number(match[3]),
    patch: Number(match[4]),
  };
}

export function suggestNextReleaseTag(tags: string[]): string {
  const parsed = (Array.isArray(tags) ? tags : [])
    .map(parseSemverTag)
    .filter((item): item is ParsedTag => Boolean(item));

  if (parsed.length === 0) return 'v0.1.0';

  parsed.sort((a, b) => {
    if (a.major !== b.major) return b.major - a.major;
    if (a.minor !== b.minor) return b.minor - a.minor;
    return b.patch - a.patch;
  });

  const top = parsed[0];
  return `${top.prefix || 'v'}${top.major}.${top.minor}.${top.patch + 1}`;
}
