import { describe, expect, it } from 'vitest';
import { validateGithubReleaseInput } from '../githubReleaseValidation';

describe('validateGithubReleaseInput', () => {
  it('returns required errors for empty tag and release name', () => {
    const result = validateGithubReleaseInput({ tagName: '   ', releaseName: '' });

    expect(result.valid).toBe(false);
    expect(result.errors.tagName).toBe('release.validation.tagRequired');
    expect(result.errors.releaseName).toBe('release.validation.nameRequired');
  });

  it('rejects tags with whitespace or invalid ref chars', () => {
    expect(validateGithubReleaseInput({ tagName: 'release 1.0.0', releaseName: 'Release 1.0.0' }).errors.tagName)
      .toBe('release.validation.tagInvalid');
    expect(validateGithubReleaseInput({ tagName: 'release^1.0.0', releaseName: 'Release 1.0.0' }).errors.tagName)
      .toBe('release.validation.tagInvalid');
  });

  it('enforces minimum release name length', () => {
    const result = validateGithubReleaseInput({ tagName: 'v1.0.0', releaseName: 'ab' });

    expect(result.valid).toBe(false);
    expect(result.errors.releaseName).toBe('release.validation.nameTooShort');
  });

  it('accepts valid release input', () => {
    const result = validateGithubReleaseInput({ tagName: 'v1.0.0', releaseName: 'Release v1.0.0' });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });
});
