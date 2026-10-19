import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gitIdentityClient } from '@/services/gitIdentityClient';
import type { GitIdentityScope, GitIdentityStatus } from '@/shared/ipc/gitIdentity';
import { validGitIdentityName, validGitIdentityEmail } from '@/shared/ipc/gitIdentity';
import { useAppToast } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { readIdentitySettingsScope, rememberIdentitySettingsScope } from './gitIdentityScopePreference';

export function useGitIdentityForm(repoPath: string | null, initial?: GitIdentityStatus, options: { rememberScope?: boolean } = {}) {
  const { tr } = useI18n();
  const toast = useAppToast();
  const [scope, setScopeState] = useState<GitIdentityScope>(
    () => initial?.scope || (options.rememberScope ? readIdentitySettingsScope(repoPath) : repoPath ? 'repository' : 'global'),
  );
  const setScope = (next: GitIdentityScope) => {
    setScopeState(next);
    if (options.rememberScope) rememberIdentitySettingsScope(next);
  };
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [status, setStatus] = useState<GitIdentityStatus | null>(initial || null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const savingRef = useRef(false);
  const feedback = useRef({ toast, tr });
  useLayoutEffect(() => {
    feedback.current = { toast, tr };
  }, [toast, tr]);
  const available = gitIdentityClient.isAvailable();

  useLayoutEffect(() => {
    const current = ++generation.current;
    if (!repoPath) setScopeState('global');
    return () => {
      generation.current = current + 1;
    };
  }, [repoPath, scope]);

  useEffect(() => {
    const current = generation.current;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setStatus(null);
    if (!available) {
      setLoading(false);
      return;
    }
    void gitIdentityClient
      .read({ repoPath, scope })
      .then((result) => {
        if (cancelled || current !== generation.current) return;
        if (!result.success) throw new Error(result.error);
        setStatus(result.data);
        setName(result.data.name);
        setEmail(result.data.email);
      })
      .catch((error: unknown) => {
        if (cancelled || current !== generation.current) return;
        setFailed(true);
        feedback.current.toast(
          error instanceof Error ? error.message : feedback.current.tr('Git-Identität konnte nicht gelesen werden.', 'Could not read Git identity.'),
          true,
        );
      })
      .finally(() => {
        if (!cancelled && current === generation.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, scope, reload, available]);

  const save = async (forCommit = false): Promise<boolean> => {
    if (savingRef.current || !status || loading || !validGitIdentityName(name) || !validGitIdentityEmail(email)) return false;
    const current = generation.current;
    savingRef.current = true;
    setSaving(true);
    try {
      const desired = { name: name.trim(), email: email.trim() };
      const result = await gitIdentityClient.save({ repoPath, scope, ...desired, expectedRevision: status.revision });
      if (current !== generation.current) return false;
      if (!result.success) throw new Error(result.error);
      setStatus(result.data);
      if (forCommit) {
        const effective = await gitIdentityClient.read({ repoPath, scope: 'repository' });
        if (current !== generation.current) return false;
        if (!effective.success) throw new Error(effective.error);
        if (!effective.data.ready || effective.data.name !== desired.name || effective.data.email !== desired.email)
          throw new Error(
            tr(
              'Git verwendet für dieses Repository weiterhin andere oder unvollständige Angaben. Prüfe den Geltungsbereich; lokale Einstellungen und Autor-/Committer-Vorgaben haben Vorrang.',
              'Git still uses different or incomplete details for this repository. Check the scope; local settings and author/committer overrides take precedence.',
            ),
          );
      }
      if (!result.data.ready || result.data.name !== desired.name || result.data.email !== desired.email)
        throw new Error(
          tr(
            'Git hat die eingegebenen Werte nicht übernommen. Andere Git-Vorgaben überschreiben sie. Lade die aktuellen Werte neu und prüfe den Geltungsbereich.',
            'Git did not apply the entered values. Other Git settings override them. Reload the current values and check the scope.',
          ),
        );
      setName(result.data.name);
      setEmail(result.data.email);
      toast(tr('Git-Commit-Identität gespeichert.', 'Git commit identity saved.'), false);
      return true;
    } catch (error: unknown) {
      if (current === generation.current)
        toast(error instanceof Error ? error.message : tr('Git-Identität konnte nicht gespeichert werden.', 'Could not save Git identity.'), true);
      return false;
    } finally {
      savingRef.current = false;
      if (current === generation.current) setSaving(false);
    }
  };
  return {
    scope,
    setScope,
    name,
    setName,
    email,
    setEmail,
    loading,
    saving,
    failed,
    available,
    canSave: available && !loading && !saving && Boolean(status) && validGitIdentityName(name) && validGitIdentityEmail(email),
    reload: () => setReload((value) => value + 1),
    save,
  };
}
