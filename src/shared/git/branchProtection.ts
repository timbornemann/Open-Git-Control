export const PRIMARY_BRANCH_NAMES: readonly string[] = ['main', 'master'];
export const PROTECTED_BRANCH_ERROR = '[PROTECTED_BRANCH]';

export const isPrimaryBranchName = (name: string): boolean => PRIMARY_BRANCH_NAMES.includes(name.toLowerCase());
