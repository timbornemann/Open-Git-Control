// Git accepts tag names as ref names. This pattern covers the character-level
// restrictions; the remaining ref-name rules are checked below.
// eslint-disable-next-line no-control-regex -- Git ref names reject ASCII control bytes.
export const RELEASE_TAG_PATTERN = /^[^\s\x00-\x1F\x7F~^:?*[\]\\]+$/;

const hasInvalidRefComponent = (tagName: string): boolean => tagName.split('/').some((component) => component.startsWith('.') || component.endsWith('.lock'));

export const isValidReleaseTagName = (tagName: string): boolean => {
  if (!RELEASE_TAG_PATTERN.test(tagName)) return false;

  return (
    tagName !== '@' &&
    !tagName.startsWith('/') &&
    !tagName.endsWith('/') &&
    !tagName.includes('//') &&
    !tagName.includes('..') &&
    !tagName.includes('@{') &&
    !tagName.endsWith('.') &&
    !hasInvalidRefComponent(tagName)
  );
};

export type ReleaseValidationResult = {
  valid: boolean;
  errors: {
    tagName?: string;
    releaseName?: string;
  };
};

export const validateGithubReleaseInput = (
  params: {
    tagName: string;
    releaseName: string;
  },
  options?: {
    minReleaseNameLength?: number;
  },
): ReleaseValidationResult => {
  const tagName = (params.tagName || '').trim();
  const releaseName = (params.releaseName || '').trim();
  const minReleaseNameLength = options?.minReleaseNameLength ?? 3;

  const errors: ReleaseValidationResult['errors'] = {};

  if (!tagName) {
    errors.tagName = 'release.validation.tagRequired';
  } else if (!isValidReleaseTagName(tagName)) {
    errors.tagName = 'release.validation.tagInvalid';
  }

  if (!releaseName) {
    errors.releaseName = 'release.validation.nameRequired';
  } else if (releaseName.length < minReleaseNameLength) {
    errors.releaseName = 'release.validation.nameTooShort';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};
