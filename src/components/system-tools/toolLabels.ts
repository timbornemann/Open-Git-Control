import type { SystemToolId, SystemToolState } from '@/shared/ipc/systemTools';
type Translate = (de: string, en: string) => string;
export const toolName = (id: SystemToolId) => (id === 'git' ? 'Git' : id === 'git-lfs' ? 'Git LFS' : 'GitHub CLI');
export const toolPurpose = (id: SystemToolId, tr: Translate) =>
  id === 'git'
    ? tr('Erforderlich für lokale Git-Funktionen.', 'Required for local Git operations.')
    : id === 'git-lfs'
      ? tr('Optional; für große Dateien und LFS-Transfers.', 'Optional; for large files and LFS transfers.')
      : tr('Optional; für die Anmeldung über die GitHub CLI.', 'Optional; for signing in through GitHub CLI.');
export const toolStateLabel = (state: SystemToolState, tr: Translate) =>
  state === 'checking'
    ? tr('Prüfung läuft', 'Checking')
    : state === 'available'
      ? tr('Verfügbar', 'Available')
      : state === 'missing'
        ? tr('Nicht gefunden', 'Not found')
        : tr('Nicht ausführbar', 'Not executable');
export const toolPhaseLabel = (phase: string, tr: Translate) =>
  phase === 'preparing'
    ? tr('Installation wird vorbereitet …', 'Preparing installation …')
    : phase === 'installing'
      ? tr('Paket wird installiert …', 'Installing package …')
      : tr('Werkzeug wird geprüft …', 'Verifying tool …');
