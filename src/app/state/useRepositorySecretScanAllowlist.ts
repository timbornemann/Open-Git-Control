import { useEffect } from 'react';
import { repositorySecretScanAllowlistClient } from '@/services/repositorySecretScanAllowlistClient';
import { useLanguageTranslations, type AppLanguage } from '@/i18n';
import { OPEN_SECRET_SCAN_ALLOWLIST_EVENT } from '@/components/repository-security/secretScanAllowlistNavigation';

export function useRepositorySecretScanAllowlist(
  activeRepo: string | null,
  language: AppLanguage,
  notify: (toast: { msg: string; isError: boolean }) => void,
  openEditor: () => void,
) {
  const { tr } = useLanguageTranslations(language);
  useEffect(() => {
    if (!activeRepo || !repositorySecretScanAllowlistClient.isAvailable()) return;
    const open = (event: Event) => {
      if ((event as CustomEvent<{ repoPath: string }>).detail?.repoPath === activeRepo) openEditor();
    };
    window.addEventListener(OPEN_SECRET_SCAN_ALLOWLIST_EVENT, open);
    const unsubscribe = repositorySecretScanAllowlistClient.onMigration((repoPath, report) => {
      if (repoPath !== activeRepo) return;
      if (!report.importedRules && !report.discardedRules) return;
      const name = activeRepo.split(/[\\/]/).pop();
      notify({
        msg: tr(
          `${name}: ${report.importedRules} Allowlist-Regeln übernommen, ${report.discardedRules} nicht zuordenbare Regeln nicht übernommen.`,
          `${name}: imported ${report.importedRules} allowlist rules; omitted ${report.discardedRules} rules that could not be assigned.`,
        ),
        isError: false,
      });
    });
    // Preparation migrates before the first scan, even if the editor is never
    // opened. Errors are presented by the editor or scan that requires policy.
    void repositorySecretScanAllowlistClient.get(activeRepo).catch(() => {});
    void repositorySecretScanAllowlistClient.watch(activeRepo).catch(() => {});
    return () => {
      window.removeEventListener(OPEN_SECRET_SCAN_ALLOWLIST_EVENT, open);
      unsubscribe();
      void repositorySecretScanAllowlistClient.watch(null).catch(() => {});
    };
  }, [activeRepo, language, notify, tr, openEditor]);
}
