import { useLayoutEffect, useRef, useState } from 'react';
import { aiClient } from '@/services/aiClient';
import { hostingClient } from '@/services/hostingClient';
import type { ReleaseCommitDto, ReleaseContext } from '@/types/releaseNotes';
import {
  buildAlgorithmicChangeListMarkdown,
  buildOfflineReleaseNotesMarkdown,
  buildReleaseNotesPromptHints,
  filterCommitsForReleaseNotes,
  stripEmptyBreakingChangesSections,
} from '@/utils/releaseNotes';
import type { ReleaseSession } from './releaseDraftState';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';

async function loadLocalReleaseCommits(repoPath: string, session: ReleaseSession): Promise<{ commits: ReleaseCommitDto[]; warning: string }> {
  const fromRef = session.form.fromRef?.trim() || undefined;
  const local = await hostingClient.request('releaseNotesCommits', { repoPath, toRef: session.form.targetCommitish.trim() || 'HEAD', fromRef });
  const commits = local.slice(0, 400).map((commit) => ({
    hash: commit.sha,
    shortHash: commit.sha.slice(0, 7),
    subject: commit.message,
    description: commit.description,
    author: commit.author || '',
    date: commit.date || '',
  }));
  const warnings = [
    local.length > 400
      ? session.language === 'de'
        ? 'Die Offline-Notes enthalten die neuesten 400 Commits.'
        : 'Offline notes include the latest 400 commits.'
      : '',
    !fromRef
      ? session.language === 'de'
        ? 'Ohne verfügbaren Hosting-Kontext oder explizite Notes-Ausgangsrevision verwendet die Vorlage die lokale Historie; die letzte Veröffentlichung wurde nicht geprüft.'
        : 'Without hosting context or an explicit notes baseline, the template uses local history; the last publication was not checked.'
      : '',
  ];
  return { commits, warning: warnings.filter(Boolean).join(' ') };
}

export function useReleaseNotesGeneration(
  scope: string,
  session: ReleaseSession,
  context: ReleaseContext | null,
  connectionId: string | undefined,
  update: (updater: (previous: ReleaseSession) => ReleaseSession) => void,
  repoPath: string,
) {
  const lifecycle = useRef({ generation: 0 }).current;
  const running = useRef(false);
  const current = useRef({ scope, session, context });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [mode, setMode] = useState<'ai' | 'offline' | null>(null);
  useLayoutEffect(() => {
    current.current = { scope, session, context };
  }, [scope, session, context]);
  useLayoutEffect(() => {
    lifecycle.generation++;
    running.current = false;
    setBusy(false);
    setMessage('');
    setIsError(false);
    setMode(null);
    return () => {
      lifecycle.generation++;
    };
  }, [scope, lifecycle]);
  const run = async (kind: 'ai' | 'offline', versionBump: ReleaseVersionBump) => {
    if (running.current || session.created || !session.form.tagName.trim() || (kind === 'ai' ? !context : !repoPath)) return;
    const started = ++lifecycle.generation;
    const fingerprint = JSON.stringify(session);
    const authVersion = hostingClient.sessionVersion(connectionId);
    const valid = () =>
      lifecycle.generation === started &&
      current.current.scope === scope &&
      current.current.context?.targetOid === context?.targetOid &&
      JSON.stringify(current.current.session) === fingerprint &&
      hostingClient.sessionVersion(connectionId) === authVersion;
    running.current = true;
    setBusy(true);
    setMessage('');
    setIsError(false);
    setMode(kind);
    try {
      const local =
        kind === 'offline' && (!context || context.commitsTarget !== session.form.targetCommitish.trim())
          ? await loadLocalReleaseCommits(repoPath, session)
          : null;
      if (!valid()) return;
      const commits = filterCommitsForReleaseNotes(local?.commits || context?.commitsSinceLastRelease || [], session.options);
      const params = {
        tagName: session.form.tagName,
        releaseName: session.form.releaseName || `Release ${session.form.tagName}`,
        lastReleaseTag: session.form.fromRef || context?.lastReleaseTag,
        commits,
        repositoryHtmlUrl: context?.repositoryHtmlUrl,
        language: session.language,
        versionBump,
        hints: buildReleaseNotesPromptHints(session.options, session.language),
      };
      if (kind === 'offline') {
        if (valid()) {
          update((previous) => ({
            ...previous,
            form: { ...previous.form, body: buildOfflineReleaseNotesMarkdown(params, session.options.includeHashesInAlgorithmicList) },
          }));
          setMessage(local?.warning || '');
        }
        return;
      }
      const result = await aiClient.generateReleaseNotes(params);
      if (!valid()) return;
      if (!result.success) throw new Error(result.error);
      const automatic =
        result.data.source === 'ai' && session.options.appendAlgorithmicChangeList
          ? buildAlgorithmicChangeListMarkdown(commits, session.language, session.options.includeHashesInAlgorithmicList)
          : '';
      const markdown = stripEmptyBreakingChangesSections(result.data.markdown);
      update((previous) => ({ ...previous, form: { ...previous.form, body: [markdown, automatic].filter(Boolean).join('\n\n') } }));
      if (result.data.source !== 'ai')
        setMessage(
          result.data.warning ||
            (session.language === 'de'
              ? 'KI nicht verfügbar; deterministische Release-Notes wurden erstellt.'
              : 'AI unavailable; deterministic release notes were generated.'),
        );
    } catch (reason) {
      if (valid()) {
        setMessage(reason instanceof Error ? reason.message : String(reason));
        setIsError(true);
      }
    } finally {
      if (lifecycle.generation === started) {
        running.current = false;
        setBusy(false);
        setMode(null);
      }
    }
  };
  return {
    busy,
    message,
    isError,
    mode,
    generate: (version: ReleaseVersionBump) => run('ai', version),
    generateOffline: (version: ReleaseVersionBump) => run('offline', version),
  };
}
