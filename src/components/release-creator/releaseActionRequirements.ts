export function aiNotesRequirement(
  values: {
    available: boolean;
    submitting: boolean;
    generating: boolean;
    published: boolean;
    loading: boolean;
    repository: boolean;
    contextMatches: boolean;
    hasTag: boolean;
    commits: number;
  },
  tr: (de: string, en: string) => string,
): string | null {
  if (values.available || values.submitting || values.generating) return null;
  if (values.published) return tr('Dieser Release wurde bereits erstellt.', 'This release has already been created.');
  if (values.loading) return tr('Der Commit-Verlauf wird noch geladen.', 'Commit history is still loading.');
  if (!values.repository) return tr('Wähle zuerst ein Hosting-Ziel.', 'Choose a hosting target first.');
  if (!values.contextMatches) return tr('Aktualisiere den Verlauf für das gewählte Ziel.', 'Refresh history for the selected target.');
  if (!values.hasTag) return tr('Gib zuerst einen Versionstag ein.', 'Enter a version tag first.');
  if (!values.commits)
    return tr(
      'Für dieses Ziel gibt es keine neuen Commits für KI-Notes. Die lokale Vorlage bleibt verfügbar.',
      'This target has no new commits for AI notes. The local template remains available.',
    );
  return null;
}
