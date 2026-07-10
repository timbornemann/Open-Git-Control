import type { validateGithubReleaseInput } from '@/utils/githubReleaseValidation';

type ReleaseValidation = ReturnType<typeof validateGithubReleaseInput>;

export const getReleaseValidationErrorMessage = (validation: ReleaseValidation, t: (key: string) => string): string | null => {
  if (validation.valid) return null;
  if (validation.errors.tagName === 'release.validation.tagRequired') return t('generated.components.releasecreator.tag_name_must_not_be_empty_370b7b0d');
  if (validation.errors.tagName === 'release.validation.tagInvalid') {
    return t('generated.components.releasecreator.tag_name_contains_invalid_characters_or_whitespace_ca817c36');
  }
  if (validation.errors.releaseName === 'release.validation.nameRequired') {
    return t('generated.components.layout.sidebar.githubconnectedcontent.release_name_must_not_be_empty_453809c9');
  }
  return t('generated.components.releasecreator.release_name_is_too_short_min_3_chars_c39377d1');
};

export const getCreateReleaseErrorMessage = (errorText: string, t: (key: string) => string): string => {
  const normalized = errorText.toLowerCase();
  if (normalized.includes('tag existiert bereits') || normalized.includes('already_exists')) {
    return t('generated.components.layout.workflows.usereleaseworkflow.this_tag_already_exists_choose_a_different_tag_or_use_th_31f19d6a');
  }
  if (normalized.includes('berechtigung') || normalized.includes('permission') || normalized.includes('forbidden')) {
    return t('generated.components.layout.workflows.usereleaseworkflow.missing_repository_permission_check_token_scopes_and_rep_695cc307');
  }
  if (normalized.includes('targetcommitish') || normalized.includes('target_commitish')) {
    return t('generated.components.layout.workflows.usereleaseworkflow.target_branch_commit_is_invalid_please_verify_branch_or_0f08d8ef');
  }
  return errorText || t('generated.components.layout.workflows.usereleaseworkflow.could_not_create_release_7ed5aef0');
};
