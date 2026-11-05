import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import type { RepositoryFileContextDto, RepositoryFilePreviewDto } from '@/shared/ipc/repositoryFiles';
import { DEMO_TIME, ok, type DemoRepository } from './demoRepository';
import { writeDemoFile, writeDemoIndexFile, isDemoIgnored } from './demoFiles';
import { demoFileVersion, demoFileRevision } from './demoFileVersions';
import { demoBlob, demoBlobBytes, readDemoBlob, isDemoGitlink } from './demoBlob';
import { demoFileHashes } from './demoHashes';
import { demoFileHistory } from './demoHistory';

/** Source-bound editor snapshots for the isolated renderer, without native IO. */
export function createDemoFileApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  const error = (message: string) => ({ success: false as const, error: message });
  const valid = (request: RepositoryFileContextDto) =>
    request.repoPath === repo.activeRepo &&
    ['unstaged', 'staged', 'commit'].includes(request.source) &&
    (request.source !== 'commit' || repo.commits.some((commit) => commit.hash === request.commitHash));
  const preview = (request: RepositoryFileContextDto): RepositoryFilePreviewDto => {
    const blob = repo.fileAt(request.source, request.path, request.commitHash);
    const version =
      request.source === 'commit'
        ? JSON.stringify([request.repoPath, request.path, request.source, request.commitHash])
        : demoFileVersion(repo, request.source, request.path);
    const snapshot = {
      version,
      editable: request.source !== 'commit',
      modifiedAt: new Date(DEMO_TIME + (request.source === 'unstaged' ? demoFileRevision(repo, 'unstaged', request.path) * 1000 : 0)).toISOString(),
      ...(request.source === 'commit' ? { readOnlyReason: 'Commit-Dateien sind schreibgeschützt. / Commit files are read-only.' } : {}),
    };
    if (isDemoGitlink(blob))
      return {
        ...snapshot,
        kind: 'missing',
        bytes: 0,
        editable: false,
        reason: 'Ein Submodul enthält ein eigenes Repository. Nutze die Submodul-Karte. / A submodule contains a separate repository. Use the submodule card.',
      };
    if (blob === undefined)
      return {
        ...snapshot,
        kind: 'missing',
        bytes: 0,
        editable: false,
        reason: 'Die Beispieldatei ist in dieser Quelle nicht vorhanden. / The sample file is absent in this source.',
      };
    const decoded = readDemoBlob(blob),
      bytes = decoded.bytes.length;
    if (decoded.encoding === 'binary') return { ...snapshot, kind: 'binary', bytes, mimeType: null, reason: 'binary', editable: false };
    return { ...snapshot, kind: 'text', text: decoded.text, bytes, isMarkdown: /\.md$/i.test(request.path), encoding: decoded.encoding };
  };
  const info = async (request: RepositoryFileContextDto) => {
    if (!valid(request)) return error('Das Übungsrepository oder der Commit ist nicht mehr aktuell. / The practice repository or commit changed.');
    const file = preview(request);
    if (file.kind === 'missing') return error(file.reason);
    try {
      const hashes = await demoFileHashes(demoBlobBytes(repo.fileAt(request.source, request.path, request.commitHash)!));
      if (!valid(request) || preview(request).version !== file.version)
        return error('Die Dateiquelle hat sich geändert. Bitte erneut versuchen. / The file source changed. Please retry.');
      return ok({ ...file, path: request.path, hashes });
    } catch (cause) {
      return error(cause instanceof Error ? cause.message : 'Hash calculation failed.');
    }
  };
  return {
    getRepositoryFilePreview: async (request) =>
      valid(request)
        ? ok(preview(request))
        : error('Das Übungsrepository oder der Commit ist nicht mehr aktuell. / The practice repository or commit changed.'),
    getRepositoryFileInfo: info,
    getWorkingDirectoryFileInfo: async (path, repoPath) => {
      const request = { path, repoPath, source: 'unstaged' as const },
        result = await info(request);
      if (!result.success) return result;
      if (!valid(request) || preview(request).version !== result.data.version) return error('The practice file source changed.');
      const history = demoFileHistory(repo, path);
      const entry = (commit: (typeof history)[number] | undefined) =>
        commit ? { hash: commit.hash, abbrevHash: commit.abbrevHash, author: commit.author, date: commit.date, subject: commit.subject } : null;
      const time = new Date(DEMO_TIME).toISOString(),
        name = path.split('/').at(-1) || path;
      return ok({
        path,
        name,
        extension: name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : null,
        bytes: result.data.bytes,
        createdAt: time,
        modifiedAt: result.data.modifiedAt || time,
        accessedAt: time,
        readOnly: !result.data.editable,
        hashes: result.data.hashes,
        git: {
          tracked: Object.prototype.hasOwnProperty.call(repo.indexFiles, path),
          ignored: isDemoIgnored(repo, path),
          staged: repo.staged.has(path),
          modified: repo.modified.has(path),
          conflicted: Boolean(repo.mergeState?.conflicts.has(path)),
          historyCount: history.length,
          firstCommit: entry(history.at(-1)),
          latestCommit: entry(history[0]),
        },
      });
    },
    saveRepositoryFile: async (request) => {
      if (!valid(request) || request.source === 'commit')
        return error('Diese Dateiquelle kann in der Übung nicht geändert werden. / This file source cannot be edited in practice.');
      const current = preview(request);
      if (!current.editable || current.kind !== 'text')
        return error('Diese Beispieldatei ist nicht als Text bearbeitbar. / This sample file cannot be edited as text.');
      if (request.expectedVersion !== current.version)
        return error('Die Dateiversion hat sich geändert. Dein Entwurf bleibt erhalten. / The file version changed. Your draft is preserved.');
      if (request.content.includes('\0'))
        return error('Die Editorübung erwartet Text ohne NUL-Zeichen. / The editor exercise expects text without NUL characters.');
      const blob = demoBlob(request.content, request.encoding);
      try {
        readDemoBlob(blob);
      } catch (cause) {
        return error(cause instanceof Error ? cause.message : 'Unsupported text encoding.');
      }
      if (request.source === 'staged') writeDemoIndexFile(repo, request.path, blob);
      else writeDemoFile(repo, request.path, blob);
      const saved = preview(request);
      return ok({ version: saved.version, bytes: saved.bytes, modifiedAt: saved.modifiedAt });
    },
    getWorkingDirectoryPreview: async (path, repoPath) => {
      if (repoPath !== repo.activeRepo) return error('Das Übungsrepository hat sich geändert. / The practice repository changed.');
      const file = preview({ repoPath: repo.activeRepo, path, source: 'unstaged' });
      return file.kind === 'missing' ? error(file.reason) : ok({ ...file, modifiedAt: file.modifiedAt || new Date(DEMO_TIME).toISOString() });
    },
    getMarkdownPreviewFile: async (request) => {
      const context = { ...request, repoPath: request.repoPath || repo.activeRepo };
      if (!valid(context)) return error('Die Übungsquelle hat sich geändert. / The practice source changed.');
      const file = preview(context);
      return file.kind === 'text' ? ok({ text: file.text }) : error('Keine Textvorschau für diese Beispieldatei. / No text preview for this sample file.');
    },
  };
}
