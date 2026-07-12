import React from 'react';
import { useRepositoryContext, useUIContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { buildLicenseDocuments, getLicenseTemplateRequirements, LICENSE_TEMPLATE_OPTIONS, type LicenseTemplateId } from '@/shared/licenseTemplates';
import { RepoCard, RepoCardContent, RepoCardHeader } from './RepoCard';

const LICENSE_FILE_CANDIDATES = ['LICENSE', 'LICENSE.md', 'license', 'license.md', 'COPYING'];
const NOTICE_FILE_CANDIDATES = ['NOTICE', 'NOTICE.md', 'notice', 'notice.md'];

type RepositoryLicensePanelProps = {
  repoPath: string;
};

const getRepositoryName = (repoPath: string): string =>
  repoPath
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || 'My Program';

export const RepositoryLicensePanel: React.FC<RepositoryLicensePanelProps> = ({ repoPath }) => {
  const { tr } = useI18n();
  const { setConfirmDialog } = useUIContext();
  const { onToast, triggerRefresh } = useRepositoryContext();
  const [collapsed, setCollapsed] = React.useState(false);
  const [license, setLicense] = React.useState<Exclude<LicenseTemplateId, 'none'>>('MIT');
  const [copyrightHolder, setCopyrightHolder] = React.useState('');
  const [programName, setProgramName] = React.useState(() => getRepositoryName(repoPath));
  const [programDescription, setProgramDescription] = React.useState('');
  const [existingLicenseFile, setExistingLicenseFile] = React.useState<string | null>(null);
  const [existingNoticeFile, setExistingNoticeFile] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const licenseCheckGenerationRef = React.useRef(0);
  const currentRepoPathRef = React.useRef(repoPath);
  const autoCollapsedRepositoryRef = React.useRef<string | null>(null);
  // Update during render so a response from the previous repository can never
  // win the render-to-effect gap while the selected repository is changing.
  currentRepoPathRef.current = repoPath;

  React.useEffect(() => {
    licenseCheckGenerationRef.current += 1;
    setProgramName(getRepositoryName(repoPath));
    setProgramDescription('');
    setCollapsed(false);
    setExistingLicenseFile(null);
    setExistingNoticeFile(null);
    setLoading(true);
    autoCollapsedRepositoryRef.current = null;
  }, [repoPath]);

  const refreshLicensePresence = React.useCallback(
    async (requestedRepoPath = repoPath) => {
      if (requestedRepoPath !== currentRepoPathRef.current) return;
      const generation = licenseCheckGenerationRef.current + 1;
      licenseCheckGenerationRef.current = generation;
      if (!gitClient.isAvailable()) {
        if (currentRepoPathRef.current === requestedRepoPath) setLoading(false);
        return;
      }
      const isCurrent = () => licenseCheckGenerationRef.current === generation && currentRepoPathRef.current === requestedRepoPath;
      const findExistingFile = async (candidates: string[]): Promise<string | null> => {
        for (const filePath of candidates) {
          const result = await gitClient.readRepoFile(filePath, requestedRepoPath);
          if (!isCurrent()) return null;
          if (result.success) return filePath;
          // A missing candidate is expected; permission, authorization, and
          // filesystem errors are not evidence that no license exists.
          if (result.error && !/(?:\bENOENT\b|no such file|not found)/i.test(result.error)) throw new Error(result.error);
        }
        return null;
      };

      setLoading(true);
      try {
        const licenseFile = await findExistingFile(LICENSE_FILE_CANDIDATES);
        if (!isCurrent()) return;
        const noticeFile = await findExistingFile(NOTICE_FILE_CANDIDATES);
        if (!isCurrent()) return;
        setExistingLicenseFile(licenseFile);
        setExistingNoticeFile(noticeFile);
        if (licenseFile && autoCollapsedRepositoryRef.current !== requestedRepoPath) {
          setCollapsed(true);
          autoCollapsedRepositoryRef.current = requestedRepoPath;
        }
      } catch (loadError: unknown) {
        if (!isCurrent()) return;
        setExistingLicenseFile(null);
        setExistingNoticeFile(null);
        onToast(loadError instanceof Error ? loadError.message : tr('Lizenz konnte nicht geprueft werden.', 'Could not check the license.'), true);
      } finally {
        if (isCurrent()) setLoading(false);
      }
    },
    [onToast, repoPath, tr],
  );

  React.useEffect(() => {
    void refreshLicensePresence(repoPath);
    return () => {
      licenseCheckGenerationRef.current += 1;
    };
  }, [refreshLicensePresence, repoPath]);

  const requirements = getLicenseTemplateRequirements(license);
  const requiresApplicationNotice = requirements.createsApplicationNotice;

  const writeLicense = async () => {
    const repoAtWrite = repoPath;
    if (!gitClient.isAvailable() || applying || currentRepoPathRef.current !== repoAtWrite) return;
    const existingLicenseAtWrite = existingLicenseFile;
    const existingNoticeAtWrite = existingNoticeFile;
    let documents: ReturnType<typeof buildLicenseDocuments>;
    try {
      documents = buildLicenseDocuments(license, { copyrightHolder, programName, programDescription });
    } catch (templateError: unknown) {
      onToast(
        templateError instanceof Error ? templateError.message : tr('Lizenzvorlage konnte nicht erstellt werden.', 'Could not create the license template.'),
        true,
      );
      return;
    }

    const licenseDocument = documents.find((document) => document.path === 'LICENSE');
    const noticeDocument = documents.find((document) => document.path === 'NOTICE');
    if (!licenseDocument) return;

    setApplying(true);
    let licenseWritten = false;
    try {
      const targetPath = existingLicenseAtWrite || 'LICENSE';
      const licenseResult = await gitClient.writeRepoFile(targetPath, licenseDocument.content, repoAtWrite);
      if (!licenseResult.success) {
        onToast(licenseResult.error || tr('Lizenz konnte nicht gespeichert werden.', 'Could not save the license.'), true);
        return;
      }
      licenseWritten = true;

      let noticeAction: 'created' | 'updated' | 'removed' | null = null;
      if (noticeDocument) {
        const noticeResult = await gitClient.writeRepoFile(existingNoticeAtWrite || 'NOTICE', noticeDocument.content, repoAtWrite);
        if (!noticeResult.success) {
          triggerRefresh();
          void refreshLicensePresence(repoAtWrite);
          onToast(
            noticeResult.error ||
              tr('LICENSE wurde gespeichert, aber NOTICE konnte nicht aktualisiert werden.', 'LICENSE was saved, but NOTICE could not be updated.'),
            true,
          );
          return;
        }
        noticeAction = existingNoticeAtWrite ? 'updated' : 'created';
      } else if (existingNoticeAtWrite) {
        const noticeDeleteResult = await gitClient.deleteRepoFile(existingNoticeAtWrite, repoAtWrite);
        if (!noticeDeleteResult.success) {
          triggerRefresh();
          void refreshLicensePresence(repoAtWrite);
          onToast(
            noticeDeleteResult.error ||
              tr(
                'LICENSE wurde gespeichert, aber der alte NOTICE-Hinweis konnte nicht entfernt werden.',
                'LICENSE was saved, but the old NOTICE file could not be removed.',
              ),
            true,
          );
          return;
        }
        noticeAction = 'removed';
      }

      triggerRefresh();
      void refreshLicensePresence(repoAtWrite);
      onToast(
        noticeAction === 'created'
          ? tr('LICENSE und NOTICE wurden gespeichert.', 'LICENSE and NOTICE were saved.')
          : noticeAction === 'updated'
            ? tr('LICENSE und NOTICE wurden aktualisiert.', 'LICENSE and NOTICE were updated.')
            : noticeAction === 'removed'
              ? tr('LICENSE wurde aktualisiert und NOTICE entfernt.', 'LICENSE was updated and NOTICE removed.')
              : existingLicenseAtWrite
                ? tr(`${existingLicenseAtWrite} wurde ersetzt.`, `${existingLicenseAtWrite} was replaced.`)
                : tr('LICENSE wurde hinzugefuegt.', 'LICENSE was added.'),
        false,
      );
    } catch (writeError: unknown) {
      if (licenseWritten) {
        triggerRefresh();
        void refreshLicensePresence(repoAtWrite);
      }
      onToast(writeError instanceof Error ? writeError.message : tr('Lizenz konnte nicht gespeichert werden.', 'Could not save the license.'), true);
    } finally {
      setApplying(false);
    }
  };

  const requestWriteLicense = () => {
    if (existingLicenseFile) {
      setConfirmDialog({
        variant: 'confirm',
        title: tr('Lizenz ersetzen?', 'Replace license?'),
        message: tr(
          `${existingLicenseFile} ist bereits vorhanden. Die gewaehlte Lizenzvorlage ersetzt ihren gesamten Inhalt.`,
          `${existingLicenseFile} already exists. The selected license template will replace its entire content.`,
        ),
        contextItems: [
          { label: tr('Datei', 'File'), value: existingLicenseFile },
          { label: tr('Neue Vorlage', 'New template'), value: LICENSE_TEMPLATE_OPTIONS.find((option) => option.value === license)?.label || license },
          ...(requiresApplicationNotice
            ? [
                {
                  label: tr('Anwendungsnachweis', 'Application notice'),
                  value: existingNoticeFile ? tr(`${existingNoticeFile} wird aktualisiert`, `${existingNoticeFile} will be updated`) : 'NOTICE',
                },
              ]
            : existingNoticeFile
              ? [
                  {
                    label: tr('Alter Anwendungsnachweis', 'Old application notice'),
                    value: tr(`${existingNoticeFile} wird entfernt`, `${existingNoticeFile} will be removed`),
                  },
                ]
              : []),
        ],
        irreversible: false,
        consequences: tr(
          'Nicht gespeicherte lokale Aenderungen an betroffenen Lizenz- und NOTICE-Dateien werden ueberschrieben oder entfernt.',
          'Unsaved local changes in affected license and NOTICE files will be overwritten or removed.',
        ),
        confirmLabel: tr('Lizenz ersetzen', 'Replace license'),
        onConfirm: writeLicense,
      });
      return;
    }
    void writeLicense();
  };

  const cannotSubmit =
    loading ||
    applying ||
    (requirements.requiresCopyrightHolder && !copyrightHolder.trim()) ||
    (requirements.requiresProgramName && !programName.trim()) ||
    (requirements.requiresProgramDescription && !programDescription.trim());

  const summary = loading
    ? tr('Lizenz wird geprueft...', 'Checking license...')
    : existingLicenseFile
      ? tr(`Vorhanden: ${existingLicenseFile}`, `Present: ${existingLicenseFile}`)
      : tr('Keine Lizenzdatei', 'No license file');

  return (
    <RepoCard className="repo-license-card">
      <RepoCardHeader
        title={tr('Lizenz', 'License')}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        toggleTitle={collapsed ? tr('Lizenz anzeigen', 'Show license') : tr('Lizenz einklappen', 'Collapse license')}
        actions={<span className={`repo-license-indicator ${existingLicenseFile ? 'is-present' : 'is-missing'}`} title={summary} />}
      />
      {!collapsed && (
        <RepoCardContent className="repo-form-stack repo-license-content">
          <div className="repo-license-summary">{summary}</div>
          <label className="repo-form-label">
            {tr('Vorlage', 'Template')}
            <select
              className="repo-filter-input"
              value={license}
              onChange={(event) => setLicense(event.target.value as Exclude<LicenseTemplateId, 'none'>)}
              disabled={loading || applying}
            >
              {LICENSE_TEMPLATE_OPTIONS.filter((option) => option.value !== 'none').map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {requirements.requiresCopyrightHolder && (
            <label className="repo-form-label">
              {tr('Urheberrechtsinhaber', 'Copyright holder')}
              <input
                className="repo-filter-input"
                value={copyrightHolder}
                onChange={(event) => setCopyrightHolder(event.target.value)}
                placeholder={tr('Name oder Organisation', 'Name or organization')}
                disabled={loading || applying}
              />
            </label>
          )}
          {requirements.requiresProgramName && (
            <label className="repo-form-label">
              {tr('Programmname', 'Program name')}
              <input
                className="repo-filter-input"
                value={programName}
                onChange={(event) => setProgramName(event.target.value)}
                disabled={loading || applying}
              />
            </label>
          )}
          {requirements.requiresProgramDescription && (
            <label className="repo-form-label">
              {tr('Kurze Programmbeschreibung', 'Short program description')}
              <input
                className="repo-filter-input"
                value={programDescription}
                onChange={(event) => setProgramDescription(event.target.value)}
                placeholder={tr('Was macht dieses Programm?', 'What does this program do?')}
                disabled={loading || applying}
              />
            </label>
          )}
          {requiresApplicationNotice && (
            <div className="repo-license-help">
              {existingNoticeFile
                ? tr(
                    `${existingNoticeFile} wird mit dem Rechteinhaber aktualisiert; LICENSE bleibt der unveraenderte Originaltext.`,
                    `${existingNoticeFile} will be updated with the copyright holder; LICENSE remains the unmodified original text.`,
                  )
                : tr(
                    'Erstellt zusaetzlich NOTICE mit dem ausgefuellten Anwendungsnachweis; LICENSE bleibt der unveraenderte Originaltext.',
                    'Also creates NOTICE with the completed application notice; LICENSE remains the unmodified original text.',
                  )}
            </div>
          )}
          <button className="staging-tool-btn repo-license-submit" onClick={requestWriteLicense} disabled={cannotSubmit}>
            {applying
              ? tr('Lizenz wird gespeichert...', 'Saving license...')
              : existingLicenseFile
                ? tr('Lizenz ersetzen', 'Replace license')
                : tr('Lizenz hinzufuegen', 'Add license')}
          </button>
        </RepoCardContent>
      )}
    </RepoCard>
  );
};
