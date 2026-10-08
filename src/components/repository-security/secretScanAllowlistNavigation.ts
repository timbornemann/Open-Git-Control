export const OPEN_SECRET_SCAN_ALLOWLIST_EVENT = 'ogc:open-secret-scan-allowlist';

export function requestSecretScanAllowlistEditor(repoPath: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SECRET_SCAN_ALLOWLIST_EVENT, { detail: { repoPath } }));
}
