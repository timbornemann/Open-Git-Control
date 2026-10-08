export const SECRET_SCAN_ALLOWLIST_FILE = 'secret-scan-allowlist.txt';
export const SECRET_SCAN_ALLOWLIST_PATH = `.Open-Git-Control/${SECRET_SCAN_ALLOWLIST_FILE}`;
export const MAX_SECRET_SCAN_ALLOWLIST_BYTES = 256 * 1024;

export type SecretScanAllowlistMigrationDto = {
  importedRules: number;
  discardedRules: number;
  preservedExisting: boolean;
};

export type RepositorySecretScanAllowlistDto = {
  repoPath: string;
  relativePath: string;
  exists: boolean;
  text: string;
  version: string;
  validationError?: string;
  migration?: SecretScanAllowlistMigrationDto;
};

export type SaveRepositorySecretScanAllowlistDto = {
  repoPath: string;
  text: string;
  expectedVersion: string;
};

export type AddRepositorySecretScanAllowlistPathsDto = {
  repoPath: string;
  paths: string[];
  expectedVersion: string;
};
