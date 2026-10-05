export const REPOSITORY_ICON_DIALOG_EVENT = 'ogc:repository-icon-dialog';
export function openRepositoryIconDialog(repoPath: string) {
  window.dispatchEvent(new CustomEvent(REPOSITORY_ICON_DIALOG_EVENT, { detail: repoPath }));
}
