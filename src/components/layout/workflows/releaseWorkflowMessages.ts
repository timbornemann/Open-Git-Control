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

export const getReleaseAssetErrorMessage = (errorText: string, tr: (german: string, english: string) => string): string => {
  switch (errorText) {
    case 'RELEASE_ASSET_OWNER_REPOSITORY_REQUIRED':
      return tr('Owner und Repository sind erforderlich.', 'Owner and repository are required.');
    case 'RELEASE_ASSET_RELEASE_ID_REQUIRED':
      return tr('Eine gueltige Release-ID ist erforderlich.', 'A valid release ID is required.');
    case 'RELEASE_ASSET_FILE_PATH_REQUIRED':
      return tr('Ein Release-Asset muss ausgewaehlt werden.', 'A release asset must be selected.');
    case 'RELEASE_ASSET_FILE_NOT_AUTHORIZED':
      return tr('Release-Assets muessen zuvor ueber den Dateidialog ausgewaehlt werden.', 'Release assets must first be selected through the file dialog.');
    case 'RELEASE_ASSET_TARGET_NOT_AUTHORIZED':
      return tr('Das Ziel-Release wurde nicht in dieser Repository-Sitzung erstellt.', 'The target release was not created in this repository session.');
    case 'RELEASE_ASSET_REPOSITORY_NOT_ACTIVE':
      return tr(
        'Das zugehoerige Repository ist nicht mehr aktiv. Der Asset-Upload wurde abgebrochen.',
        'The associated repository is no longer active. The asset upload was cancelled.',
      );
    case 'RELEASE_ASSET_NAME_REQUIRED':
      return tr('Der Name des Release-Assets ist erforderlich.', 'A release asset name is required.');
    case 'RELEASE_ASSET_FILE_NOT_FOUND':
      return tr('Die Release-Asset-Datei wurde nicht gefunden.', 'The release asset file was not found.');
    case 'RELEASE_ASSET_UPLOAD_FAILED':
      return tr('Release-Asset konnte nicht hochgeladen werden.', 'Could not upload the release asset.');
    default:
      return errorText || tr('Release-Asset konnte nicht hochgeladen werden.', 'Could not upload the release asset.');
  }
};
