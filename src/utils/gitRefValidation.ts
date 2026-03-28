export type BranchNameValidationErrorCode =
  | 'empty'
  | 'contains-space'
  | 'starts-with-slash'
  | 'ends-with-slash'
  | 'double-slash'
  | 'contains-dot-dot'
  | 'contains-at-open-brace'
  | 'contains-invalid-char'
  | 'ends-with-dot'
  | 'ends-with-lock'
  | 'is-at'
  | 'segment-starts-with-dot';

const INVALID_BRANCH_CHAR_PATTERN = /[\x00-\x20~^:?*\\[\]]/;

export function validateBranchName(branchNameRaw: string): BranchNameValidationErrorCode | null {
  const name = String(branchNameRaw || '').trim();
  if (!name) return 'empty';
  if (/\s/.test(name)) return 'contains-space';
  if (name === '@') return 'is-at';
  if (name.startsWith('/')) return 'starts-with-slash';
  if (name.endsWith('/')) return 'ends-with-slash';
  if (name.includes('//')) return 'double-slash';
  if (name.includes('..')) return 'contains-dot-dot';
  if (name.includes('@{')) return 'contains-at-open-brace';
  if (name.endsWith('.')) return 'ends-with-dot';
  if (INVALID_BRANCH_CHAR_PATTERN.test(name)) return 'contains-invalid-char';

  const segments = name.split('/');
  for (const segment of segments) {
    if (!segment) return 'double-slash';
    if (segment.startsWith('.')) return 'segment-starts-with-dot';
    if (segment.endsWith('.lock')) return 'ends-with-lock';
  }

  return null;
}

export function isBranchNameValid(branchNameRaw: string): boolean {
  return validateBranchName(branchNameRaw) === null;
}

