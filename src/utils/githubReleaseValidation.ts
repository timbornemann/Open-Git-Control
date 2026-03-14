export const RELEASE_TAG_PATTERN = /^[^\s~^:?*[\]\\]+$/;

export type ReleaseValidationResult = {
  valid: boolean;
  errors: {
    tagName?: string;
    releaseName?: string;
  };
};

export const validateGithubReleaseInput = (params: {
  tagName: string;
  releaseName: string;
}, options?: {
  minReleaseNameLength?: number;
}) : ReleaseValidationResult => {
  const tagName = (params.tagName || '').trim();
  const releaseName = (params.releaseName || '').trim();
  const minReleaseNameLength = options?.minReleaseNameLength ?? 3;

  const errors: ReleaseValidationResult['errors'] = {};

  if (!tagName) {
    errors.tagName = 'release.validation.tagRequired';
  } else if (!RELEASE_TAG_PATTERN.test(tagName)) {
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
