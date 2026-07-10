const ABBREVIATED_GIT_OBJECT_ID_PATTERN = /(?:^|[^0-9a-f])([0-9a-f]{7,64})(?![0-9a-f])/i;
const FULL_GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export const extractGitObjectId = (value: unknown): string | null => {
  const match = String(value || '').match(ABBREVIATED_GIT_OBJECT_ID_PATTERN);
  return match?.[1] || null;
};

export const isFullGitObjectId = (value: unknown): boolean => FULL_GIT_OBJECT_ID_PATTERN.test(String(value || '').trim());
