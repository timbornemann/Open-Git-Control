import { redactGitCredentials } from '@/shared/git/redaction';
import type { NotificationMessage } from '@/types/notifications';

export type GitFailureKind =
  | 'git-missing'
  | 'lfs-missing'
  | 'authentication'
  | 'connection'
  | 'conflict'
  | 'identity'
  | 'local-changes'
  | 'diverged'
  | 'locked'
  | 'repository'
  | 'configuration'
  | 'cancelled'
  | 'unknown';
type Translate = (de: string, en: string) => string;

/** Classify diagnostics, never command operands (which can contain arbitrary filenames). */
export function describeGitFailure(raw: string, tr: Translate, explicitGit = false): { kind: GitFailureKind; explanation: string } | null {
  const output = raw.includes('Git Output:') ? raw.slice(raw.lastIndexOf('Git Output:') + 11) : raw.replace(/^Command failed:\s*[^\r\n]+\r?\n/i, '');
  const result = (kind: GitFailureKind, de: string, en: string) => ({ kind, explanation: tr(de, en) });
  if (
    /spawn\s+.*\bgit(?:\.exe)?\s+ENOENT|\bgit(?:\.exe)?\b.*(?:command not found|not recognized|nicht .*erkannt)|(?:command not found|not recognized).*\bgit\b|Git is (?:not installed|not available|not executable)|Git executable.*(?:not found|not available)/i.test(
      output,
    )
  )
    return result(
      'git-missing',
      'Git ist nicht installiert oder lässt sich nicht ausführen. Prüfe es in der Werkzeugverwaltung.',
      'Git is missing or cannot be executed. Check it in the tool manager.',
    );
  if (
    /git:?\s*['"]?lfs['"]? is not a git command|git-lfs.*(?:not found|not installed|ENOENT)|Git LFS (?:is required|is not installed|is unavailable)/i.test(
      output,
    )
  )
    return result(
      'lfs-missing',
      'Für diese Datei oder Übertragung wird Git LFS benötigt. Prüfe die optionale Installation.',
      'This file or transfer requires Git LFS. Check the optional installation.',
    );
  const looksGit =
    explicitGit ||
    /Git Output:|\bCommand failed:\s*git\b|\bfatal:|\[REPO_UNAVAILABLE\]|Git operation was aborted|CONFLICT \(|could not read (?:Username|Password|from remote repository)|Authentication failed for|\[remote rejected\]|\[rejected\]/i.test(
      raw,
    );
  if (!looksGit) return null;
  if (
    /Remote (?:endpoint|account binding|configuration).*changed|Unknown remote\.|Account binding URL no longer matches|no configured push destination|no such remote|No remote configured/i.test(
      output,
    )
  )
    return result(
      'configuration',
      'Remote oder Kontozuordnung wurde geändert. Prüfe die Konfiguration, bevor du die Übertragung erneut startest.',
      'The remote or account binding changed. Review the configuration before retrying the transfer.',
    );
  if (/Git operation was aborted|AbortError|operation (?:was )?(?:aborted|cancelled)|transfer was cancel(?:led|ed)/i.test(output))
    return result(
      'cancelled',
      'Der Git-Vorgang wurde abgebrochen. Du kannst ihn bei Bedarf erneut starten.',
      'The Git operation was cancelled. You can start it again when needed.',
    );
  if (/CONFLICT \(|merge conflict in|unmerged (?:files|paths)|you have unmerged|resolve (?:your|all).*conflicts|merging is not possible because/i.test(output))
    return result(
      'conflict',
      'Änderungen überschneiden sich. Löse die betroffenen Dateien im Konflikteditor, bevor du fortfährst.',
      'Changes overlap. Resolve the affected files in the conflict editor before continuing.',
    );
  if (/Author identity unknown|unable to auto-detect email|empty ident name|user\.useConfigOnly.*(?:name|email)|no (?:name|email) was given/i.test(output))
    return result(
      'identity',
      'Git braucht deinen Commit-Namen und deine E-Mail-Adresse. Die Hosting-Anmeldung ersetzt diese Angaben nicht.',
      'Git needs your commit name and email address. Hosting sign-in does not replace them.',
    );
  if (
    /Authentication failed|could not read (?:Username|Password)|terminal prompts disabled|Permission denied \(publickey|Permission to .+ denied to|You are not allowed to (?:push|download)|Invalid username or (?:password|token)|HTTP Basic: Access denied|could not read from remote repository|repository .*not found|Repository not found|(?:returned error:|HTTP)\s*(?:401|403)\b/i.test(
      output,
    )
  )
    return result(
      'authentication',
      'Git konnte nicht auf das Repository zugreifen. Prüfe Anmeldung, Zugriffsrechte und Remote-Adresse; bei SSH auch den Schlüssel.',
      'Git could not access the repository. Check sign-in, permissions and the remote address; for SSH, also check the key.',
    );
  if (
    /Could not resolve (?:host|proxy)|Failed to connect|Connection (?:refused|reset|timed out|closed)|Network is unreachable|SSL certificate problem|certificate (?:verify failed|has expired)|TLS.*(?:failed|error)|HTTP\s*5\d\d|returned error:\s*5\d\d|Internal Server Error|Bad Gateway|Service Unavailable|remote end hung up|RPC failed|Operation timed out/i.test(
      output,
    )
  )
    return result(
      'connection',
      'Der Git-Server ist nicht erreichbar oder hat die Verbindung abgelehnt. Prüfe Netzwerk, Server und Zertifikat und teste die Verbindung erneut.',
      'The Git server is unreachable or rejected the connection. Check the network, server and certificate, then verify the connection again.',
    );
  if (
    /would be overwritten|Please commit your changes or stash|cannot pull with rebase.*(?:unstaged|index contains)|untracked working tree files/i.test(output)
  )
    return result(
      'local-changes',
      'Lokale Änderungen würden überschrieben. Committe oder stashe sie im Arbeitsbereich, bevor du den Vorgang wiederholst.',
      'Local changes would be overwritten. Commit or stash them in the workspace before retrying.',
    );
  if (/non-fast-forward|fetch first|tip of your current branch is behind|divergent branches|not possible to fast-forward/i.test(output))
    return result(
      'diverged',
      'Lokaler Branch und Serverstand passen nicht zusammen. Lade die Änderungen und prüfe Merge oder Rebase vor einem erneuten Push.',
      'The local branch and server history differ. Fetch the changes and review a merge or rebase before pushing again.',
    );
  if (/index\.lock|another git process|unable to (?:create|unlink).*\.lock/i.test(output))
    return result(
      'locked',
      'Eine Git-Sperre verhindert den Vorgang. Warte auf laufende Git-Prozesse oder schließe sie und versuche es erneut; fremde Sperren werden nicht gelöscht.',
      'A Git lock blocks the operation. Wait for running Git processes or close them, then retry; locks owned by other processes are preserved.',
    );
  if (/\[REPO_UNAVAILABLE\]|not a git repository|cannot change to.*(?:No such file|does not exist)/i.test(output))
    return result(
      'repository',
      'Das lokale Repository ist nicht verfügbar. Prüfe seinen Speicherort in der Repository-Liste.',
      'The local repository is unavailable. Check its location in the repository list.',
    );
  if (!/Git Output:|\bCommand failed:\s*git\b|\bfatal:|\[remote rejected\]|\[rejected\]/i.test(raw)) return null;
  return result(
    'unknown',
    'Git konnte den Vorgang nicht abschließen. Die technischen Details enthalten den gemeldeten Grund.',
    'Git could not complete the operation. The technical details contain the reported reason.',
  );
}

export function explainGitNotification(message: NotificationMessage, tr: Translate): NotificationMessage {
  if (message.errorExplained || (!message.isError && message.kind !== 'warning') || message.kind === 'progress') return message;
  const raw = message.technicalDetails || message.msg;
  const failure = describeGitFailure(raw, tr, Boolean(message.gitContext));
  if (!failure) return message;
  return {
    ...message,
    msg: message.technicalDetails && message.msg !== raw ? `${message.msg}\n${failure.explanation}` : failure.explanation,
    technicalDetails: redactGitCredentials(raw),
    errorExplained: true,
    ...(failure.kind === 'cancelled' ? { isError: false, kind: 'info', autoHideMs: 3000 } : {}),
  };
}

export const notificationCopyText = (message: { msg: string; detail?: string; technicalDetails?: string }): string =>
  redactGitCredentials([message.msg, message.detail, message.technicalDetails].filter(Boolean).join('\n\n'));
