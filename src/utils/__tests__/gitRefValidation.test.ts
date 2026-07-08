import { describe, expect, it } from 'vitest';
import { isBranchNameValid, validateBranchName } from '@/utils/gitRefValidation';

describe('validateBranchName', () => {
  it('accepts valid branch names', () => {
    expect(validateBranchName('feature/test')).toBeNull();
    expect(validateBranchName('bugfix/JIRA-123')).toBeNull();
    expect(validateBranchName('release/v1.2.3')).toBeNull();
    expect(isBranchNameValid('feature/test')).toBe(true);
  });

  it('rejects branch names with spaces', () => {
    expect(validateBranchName('Test 1')).toBe('contains-space');
    expect(isBranchNameValid('Test 1')).toBe(false);
  });

  it('rejects empty or special top-level names', () => {
    expect(validateBranchName('')).toBe('empty');
    expect(validateBranchName('   ')).toBe('empty');
    expect(validateBranchName(null as unknown as string)).toBe('empty');
    expect(validateBranchName('@')).toBe('is-at');
  });

  it('rejects slash and trailing-dot edge cases', () => {
    expect(validateBranchName('/feature/test')).toBe('starts-with-slash');
    expect(validateBranchName('feature/test/')).toBe('ends-with-slash');
    expect(validateBranchName('feature//test')).toBe('double-slash');
    expect(validateBranchName('feature/test.')).toBe('ends-with-dot');
  });

  it('rejects branch names with invalid git ref patterns', () => {
    expect(validateBranchName('foo..bar')).toBe('contains-dot-dot');
    expect(validateBranchName('foo@{bar')).toBe('contains-at-open-brace');
    expect(validateBranchName('foo?bar')).toBe('contains-invalid-char');
    expect(validateBranchName('foo/.hidden')).toBe('segment-starts-with-dot');
    expect(validateBranchName('foo.lock')).toBe('ends-with-lock');
    expect(validateBranchName('foo/bar.lock')).toBe('ends-with-lock');
  });
});
