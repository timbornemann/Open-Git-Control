import { useLayoutEffect, useRef, useState } from 'react';
import { aiClient } from '@/services/aiClient';
import { hostingClient } from '@/services/hostingClient';
import type { ReleaseContext } from '@/types/releaseNotes';
import { buildAlgorithmicChangeListMarkdown, buildReleaseNotesPromptHints, filterCommitsForReleaseNotes } from '@/utils/releaseNotes';
import type { ReleaseSession } from './releaseDraftState';
import type { ReleaseVersionBump } from '@/utils/releaseTagSuggestion';

export function useReleaseNotesGeneration(
  scope: string,
  session: ReleaseSession,
  context: ReleaseContext | null,
  connectionId: string | undefined,
  update: (updater: (previous: ReleaseSession) => ReleaseSession) => void,
) {
  const lifecycle = useRef({ generation: 0 }).current;
  const running = useRef(false);
  const current = useRef({ scope, session, context });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useLayoutEffect(() => {
    current.current = { scope, session, context };
  }, [scope, session, context]);
  useLayoutEffect(() => {
    lifecycle.generation++;
    running.current = false;
    setBusy(false);
    setMessage('');
    return () => {
      lifecycle.generation++;
    };
  }, [scope, lifecycle]);
  const generate = async (versionBump: ReleaseVersionBump) => {
    if (running.current || !context || !session.form.tagName.trim()) return;
    const started = ++lifecycle.generation;
    const fingerprint = JSON.stringify(session);
    const authVersion = hostingClient.sessionVersion(connectionId);
    const valid = () =>
      lifecycle.generation === started &&
      current.current.scope === scope &&
      current.current.context?.targetOid === context.targetOid &&
      JSON.stringify(current.current.session) === fingerprint &&
      hostingClient.sessionVersion(connectionId) === authVersion;
    running.current = true;
    setBusy(true);
    setMessage('');
    try {
      const commits = filterCommitsForReleaseNotes(context.commitsSinceLastRelease, session.options);
      const result = await aiClient.generateReleaseNotes({
        tagName: session.form.tagName,
        releaseName: session.form.releaseName || `Release ${session.form.tagName}`,
        lastReleaseTag: session.form.fromRef || context.lastReleaseTag,
        commits,
        repositoryHtmlUrl: context.repositoryHtmlUrl,
        language: session.language,
        versionBump,
        hints: buildReleaseNotesPromptHints(session.options, session.language),
      });
      if (!valid()) return;
      if (!result.success) throw new Error(result.error);
      const automatic = session.options.appendAlgorithmicChangeList
        ? buildAlgorithmicChangeListMarkdown(commits, session.language, session.options.includeHashesInAlgorithmicList)
        : '';
      update((previous) => ({ ...previous, form: { ...previous.form, body: [result.data.markdown, automatic].filter(Boolean).join('\n\n') } }));
      if (result.data.source !== 'ai')
        setMessage(
          result.data.warning ||
            (session.language === 'de'
              ? 'KI nicht verfügbar; deterministische Release-Notes wurden erstellt.'
              : 'AI unavailable; deterministic release notes were generated.'),
        );
    } catch (reason) {
      if (valid()) setMessage(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (lifecycle.generation === started) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  return { busy, message, generate };
}
