import { useCallback, useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { aiClient } from '@/services/aiClient';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostingCapabilities, HostingCreateRelease, HostingPage, HostingRelease, HostingReleaseTarget } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { RemoteTransferPanel } from './RemoteTransferPanel';
import { HostingNotesOptions } from './HostingNotesOptions';
import { HostingReleaseFiles } from './HostingReleaseFiles';
import { HostingReleaseList } from './HostingReleaseList';
import { HostingReleaseInspection } from './HostingReleaseInspection';
import { DEFAULT_RELEASE_NOTES_OPTIONS, type ReleaseNotesOptions } from '@/types/releaseNotes';
import { buildAlgorithmicChangeListMarkdown, buildReleaseNotesPromptHints, filterCommitsForReleaseNotes } from '@/utils/releaseNotes';
import { suggestNextReleaseTag } from '@/utils/releaseTagSuggestion';

export function HostingReleases({
  repository,
  capabilities,
  repoPath,
  remoteName,
}: {
  repository: HostedRepository;
  capabilities: HostingCapabilities;
  repoPath: string | null;
  remoteName: string;
}) {
  const { tr } = useI18n();
  const revision = useHostingState((s) => s.revision);
  const task = useHostingTask(`${hostedRepositoryKey(repository)}:${repoPath}:${remoteName}`);
  const { run } = task;
  const [page, setPage] = useState<HostingPage<HostingRelease>>({ items: [], nextCursor: null });
  const [tagName, setTagName] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState(repository.defaultBranch);
  const [fromRef, setFromRef] = useState('');
  const [draft, setDraft] = useState(false);
  const [prerelease, setPrerelease] = useState(false);
  const [language, setLanguage] = useState<'de' | 'en'>('de');
  const [versionBump, setVersionBump] = useState<'major' | 'minor' | 'patch'>('patch');
  const [notesOptions, setNotesOptions] = useState<ReleaseNotesOptions>(DEFAULT_RELEASE_NOTES_OPTIONS);
  const [tags, setTags] = useState<string[]>([]);
  const [inspection, setInspection] = useState<HostingReleaseTarget | null>(null);
  const [created, setCreated] = useState<HostingRelease | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [showPush, setShowPush] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    setInspection(null);
    setCreated(null);
    setFiles([]);
    setUploaded([]);
    setShowPush(false);
    setMessage('');
  }, [repoPath, remoteName]);
  const reload = useCallback(() => hostingClient.request('releases', { repository: repository.ref }), [repository]);
  useEffect(() => {
    void run(reload, setPage);
    void run(async () => {
      const found: string[] = [];
      let cursor: string | undefined;
      for (let count = 0; count < 100; count++) {
        const page = await hostingClient.request('tags', { repository: repository.ref, cursor });
        found.push(...page.items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return found;
    }, setTags);
  }, [reload, revision, run, repository]);
  const input: HostingCreateRelease = {
    repository: repository.ref,
    repoPath: repoPath ?? '',
    remoteName,
    tagName,
    name: name || tagName,
    body,
    target,
    draft: capabilities.draftRelease ? draft : false,
    prerelease: capabilities.prerelease ? prerelease : false,
    inspectionId: inspection?.inspectionId,
    mode: 'remote',
  };
  const generateNotes = () =>
    void task.run(
      async () => {
        if (!repoPath) throw new Error(tr('Für KI-Notes dieses Repository zuerst lokal öffnen.', 'Open this repository locally to generate AI notes.'));
        const history = await hostingClient.request('releaseNotesCommits', { repoPath, fromRef: fromRef || undefined, toRef: target });
        const commits = filterCommitsForReleaseNotes(
          history.map((commit) => ({
            hash: commit.sha,
            shortHash: commit.sha.slice(0, 8),
            subject: commit.message,
            author: commit.author ?? '',
            date: commit.date ?? '',
          })),
          notesOptions,
        );
        const result = await aiClient.generateReleaseNotes({
          tagName,
          releaseName: name || tagName,
          lastReleaseTag: fromRef || null,
          commits,
          repositoryHtmlUrl: repository.htmlUrl,
          language,
          versionBump,
          hints: buildReleaseNotesPromptHints(notesOptions, language),
        });
        if (!result.success) throw new Error(result.error);
        const automatic = notesOptions.appendAlgorithmicChangeList
          ? buildAlgorithmicChangeListMarkdown(commits, language, notesOptions.includeHashesInAlgorithmicList)
          : '';
        return { ...result.data, markdown: [result.data.markdown, automatic].filter(Boolean).join('\n\n') };
      },
      (result) => {
        setBody(result.markdown);
        setMessage(result.warning ?? '');
      },
    );
  const publish = () =>
    void task.run(
      async () => {
        const release = await hostingClient.request('createRelease', input);
        return release;
      },
      (release) => {
        setCreated(release);
        setInspection(null);
        setUploaded([]);
        setMessage(`${tr('Veröffentlicht', 'Published')}: ${release.name}`);
        void task.run(reload, setPage);
      },
    );
  const upload = () =>
    void task.run(
      async () => {
        if (!created || !repoPath) return { successful: [], failures: [] };
        const results = await Promise.allSettled(
          files
            .filter((file) => !uploaded.includes(file))
            .map((filePath) => hostingClient.request('uploadAsset', { repository: repository.ref, repoPath, releaseId: created.id, filePath })),
        );
        const remaining = files.filter((file) => !uploaded.includes(file));
        const successful = results.flatMap((result, index) => (result.status === 'fulfilled' ? [remaining[index]] : []));
        const failures = results.filter((result) => result.status === 'rejected').map((result) => String(result.reason));
        return { successful, failures };
      },
      ({ successful, failures }) => {
        setUploaded((previous) => [...previous, ...successful]);
        if (failures.length) task.setError(failures.join('\n'));
      },
    );
  return (
    <div className="hosting-releases">
      {capabilities.releases !== 'native' && (
        <p>
          {capabilities.releases === 'downloads'
            ? tr(
                'Bitbucket verwaltet Tags und Downloads getrennt. Notes werden lokal erstellt und können als Datei veröffentlicht werden.',
                'Bitbucket manages tags and downloads separately. Create notes locally and publish them as a file.',
              )
            : tr(
                'Dieser Anbieter besitzt keine native Release-API. Tags und lokale Release-Notes bleiben verfügbar.',
                'This provider has no native release API. Tags and local release notes remain available.',
              )}
        </p>
      )}
      {capabilities.releases === 'downloads' && <HostingReleaseFiles repository={repository.ref} />}
      <HostingReleaseList repository={repository.ref} releases={page.items} showAssets={capabilities.releaseAssets && capabilities.releases === 'native'} />
      {page.nextCursor && (
        <button
          disabled={task.busy}
          onClick={() =>
            void task.run(
              () => hostingClient.request('releases', { repository: repository.ref, cursor: page.nextCursor! }),
              (next) => setPage({ ...next, items: [...page.items, ...next.items] }),
            )
          }
        >
          {tr('Weitere laden', 'Load more')}
        </button>
      )}
      <form
        className="hosting-form hosting-card"
        onSubmit={(e) => {
          e.preventDefault();
          void task.run(() => hostingClient.request('inspectRelease', input), setInspection);
        }}
      >
        <h3>{capabilities.releases === 'native' ? tr('Release erstellen', 'Create release') : tr('Tag & Notes vorbereiten', 'Prepare tag & notes')}</h3>
        <p>
          {tr('Veröffentlichungsziel', 'Publication target')}: {repository.fullName} ·{' '}
          {remoteName || tr('Kein lokaler Remote zugeordnet', 'No local remote bound')}
        </p>
        <label>
          Tag
          <input
            required
            value={tagName}
            onChange={(e) => {
              setTagName(e.target.value);
              setInspection(null);
            }}
          />
        </label>
        <label>
          {tr('Name', 'Name')}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {tr('Zielbranch, Tag oder Commit', 'Target branch, tag or commit')}
          <input
            required
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setInspection(null);
            }}
          />
        </label>
        <label>
          {tr('Notes ab Tag / Ref (optional)', 'Notes since tag / ref (optional)')}
          <input value={fromRef} onChange={(e) => setFromRef(e.target.value)} />
        </label>
        <HostingNotesOptions options={notesOptions} onChange={setNotesOptions} />
        <div className="hosting-actions">
          <select aria-label={tr('Sprache', 'Language')} value={language} onChange={(e) => setLanguage(e.target.value as 'de' | 'en')}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
          <select aria-label="Version bump" value={versionBump} onChange={(e) => setVersionBump(e.target.value as typeof versionBump)}>
            <option>patch</option>
            <option>minor</option>
            <option>major</option>
          </select>
          <button type="button" disabled={task.busy || !repoPath} onClick={generateNotes}>
            {tr('KI-Release-Notes erzeugen', 'Generate AI release notes')}
          </button>
        </div>
        <label>
          {tr('Release-Notes', 'Release notes')}
          <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className="hosting-actions">
          <button type="button" onClick={() => void navigator.clipboard.writeText(body)}>
            {tr('Notes kopieren', 'Copy notes')}
          </button>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download = `${tagName.replace(/[^a-z\d_.-]/gi, '_') || 'release'}-notes.md`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            {tr('Notes als Datei speichern', 'Save notes as file')}
          </button>
        </div>
        {capabilities.draftRelease && (
          <label className="hosting-checkbox">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Draft
          </label>
        )}
        {capabilities.prerelease && (
          <label className="hosting-checkbox">
            <input type="checkbox" checked={prerelease} onChange={(e) => setPrerelease(e.target.checked)} />
            Prerelease
          </label>
        )}
        {capabilities.releases !== 'tags' && (
          <button disabled={task.busy || !repoPath || !remoteName}>{tr('Gewählten Endpunkt prüfen', 'Inspect selected endpoint')}</button>
        )}
        {!repoPath && (
          <p>
            {tr(
              'Für die Veröffentlichung das Repository lokal öffnen und unter Remotes das Hosting-Ziel zuordnen.',
              'Open the repository locally and bind the hosting target under Remotes to publish.',
            )}
          </p>
        )}
      </form>
      {inspection && (
        <HostingReleaseInspection
          inspection={inspection}
          busy={task.busy}
          native={capabilities.releases === 'native'}
          onPublish={publish}
          onSuggest={() => {
            setTagName(suggestNextReleaseTag(tags, versionBump));
            setInspection(null);
          }}
          onTransfer={() => {
            setShowPush(true);
            setInspection(null);
          }}
        />
      )}
      {showPush && repoPath && <RemoteTransferPanel key={repoPath} repoPath={repoPath} mode="push" onClose={() => setShowPush(false)} />}
      {created && capabilities.releaseAssets && (
        <div className="hosting-card">
          <h3>{capabilities.releases === 'downloads' ? 'Downloads' : tr('Release-Dateien', 'Release assets')}</h3>
          <button
            disabled={task.busy}
            onClick={() =>
              void task.run(
                () => appClient.selectFiles(),
                (selected) => {
                  if (selected) setFiles((previous) => [...new Set([...previous, ...selected])]);
                },
              )
            }
          >
            {tr('Dateien auswählen', 'Select files')}
          </button>
          {files.map((file) => (
            <p key={file}>
              {file} {uploaded.includes(file) ? '✓' : <button onClick={() => setFiles(files.filter((value) => value !== file))}>×</button>}
            </p>
          ))}
          <button disabled={task.busy || files.every((file) => uploaded.includes(file))} onClick={upload}>
            {tr('Ausstehende Dateien hochladen', 'Upload pending files')}
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {task.busy && <p role="status">{tr('Operation läuft …', 'Operation running …')}</p>}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
