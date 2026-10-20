import { createHash } from 'node:crypto';
import source from '../../src/shared/updateSource.json';
import { MAX_HTML_PREVIEW_BYTES } from '../../src/shared/htmlPreviewSecurity';
import { STORAGE_BUDGETS } from '../../src/shared/ipc/storageMaintenance';
import { isUserNoteId, MAX_USER_NOTE_BYTES, MAX_USER_NOTE_IMAGE_BYTES, USER_NOTES_FOLDER } from '../../src/shared/userNotes';
import { emptyUserNotesSnapshot, isBlobSha, isRecord, parseUserNote, userNoteRevision, type StoredUserNote, type UserNotesSnapshot } from './userNotesModel';

type TreeEntry = { path: string; mode: string; type: string; sha: string; size?: number };
const API_ROOT = `https://api.github.com/repos/${source.owner}/${source.repo}`;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const imageMime = (path: string): string | null =>
  ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' })[
    path.split('.').pop()!.toLowerCase()
  ] || null;

/** Every request is built here; repository content can never supply a fetch URL. */
export async function fetchUserNotesSnapshot(previous: UserNotesSnapshot, signal: AbortSignal, request: typeof fetch = fetch): Promise<UserNotesSnapshot> {
  const json = async (endpoint: string): Promise<unknown> => {
    signal.throwIfAborted();
    const response = await request(`${API_ROOT}${endpoint}`, {
      signal,
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': source.productName },
    });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      // A tee'd response may never settle cancellation until its other reader
      // finishes. Start cancellation without making the error path wait for it.
      void response.body?.cancel().catch(() => undefined);
      throw new Error(response.ok ? 'GitHub user notes response is too large.' : `GitHub user notes: HTTP ${response.status}.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('GitHub user notes response has no body.');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_RESPONSE_BYTES) throw new Error('GitHub user notes response is too large.');
        chunks.push(value);
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  };
  const tree = async (ref: string): Promise<TreeEntry[]> => {
    const data = await json(`/git/trees/${encodeURIComponent(ref)}`);
    if (!isRecord(data) || !isBlobSha(data.sha) || data.truncated !== false || !Array.isArray(data.tree))
      throw new Error('Incomplete GitHub user notes directory.');
    const paths = new Set<string>();
    return data.tree.map((entry: unknown) => {
      if (
        !isRecord(entry) ||
        typeof entry.path !== 'string' ||
        /[\\/]/.test(entry.path) ||
        [...entry.path].some((char) => char.charCodeAt(0) < 32) ||
        entry.path === '.' ||
        entry.path === '..' ||
        paths.has(entry.path) ||
        typeof entry.type !== 'string' ||
        typeof entry.mode !== 'string' ||
        !isBlobSha(entry.sha)
      )
        throw new Error('Invalid GitHub user notes directory.');
      paths.add(entry.path);
      return entry as TreeEntry;
    });
  };
  const blob = async (entry: TreeEntry, limit: number): Promise<Buffer> => {
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) || (entry.size !== undefined && entry.size > limit))
      throw new Error('Unsupported or oversized user note file.');
    const data = await json(`/git/blobs/${entry.sha}`);
    if (!isRecord(data) || data.sha !== entry.sha || data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('Invalid user note file.');
    const bytes = Buffer.from(data.content, 'base64');
    if (bytes.length > limit || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== entry.sha)
      throw new Error('User note file failed validation.');
    return bytes;
  };

  const repository = await json('');
  if (!isRecord(repository) || repository.id !== source.repositoryId || typeof repository.default_branch !== 'string' || !repository.default_branch)
    throw new Error('Invalid user notes repository.');
  let entries = await tree(repository.default_branch);
  const snapshot = emptyUserNotesSnapshot();
  // Walking immutable sub-tree SHAs gives a coherent snapshot without downloading the whole repository.
  for (const segment of USER_NOTES_FOLDER.split('/')) {
    const directory = entries.find((entry) => entry.path === segment);
    if (!directory) return { ...snapshot, checkedAt: Date.now() };
    if (directory.type !== 'tree' || directory.mode !== '040000') throw new Error('User notes directory is not a regular Git tree.');
    entries = await tree(directory.sha);
  }
  const rootEntries = entries;
  let snapshotBytes = 0;
  const subtrees = new Map<string, Promise<TreeEntry[]>>();
  const findImage = async (path: string): Promise<TreeEntry | undefined> => {
    const segments = path.slice(USER_NOTES_FOLDER.length + 1).split('/');
    let current = rootEntries;
    for (const segment of segments.slice(0, -1)) {
      const directory = current.find((entry) => entry.path === segment);
      if (!directory) return undefined;
      if (directory.type !== 'tree' || directory.mode !== '040000') return undefined;
      if (!subtrees.has(directory.sha)) subtrees.set(directory.sha, tree(directory.sha));
      current = await subtrees.get(directory.sha)!;
    }
    return current.find((entry) => entry.path === segments.at(-1) && entry.type === 'blob' && ['100644', '100755'].includes(entry.mode));
  };
  for (const entry of rootEntries
    .filter((item) => isUserNoteId(item.path) && item.type === 'blob' && ['100644', '100755'].includes(item.mode))
    .sort((a, b) => (a.path < b.path ? 1 : a.path > b.path ? -1 : 0))) {
    const prior = previous.notes.find((note) => note.id === entry.path && note.blobSha === entry.sha);
    const markdown = prior?.markdown ?? new TextDecoder('utf-8', { fatal: true }).decode(await blob(entry, MAX_USER_NOTE_BYTES));
    const { title, imagePaths } = parseUserNote(markdown, entry.path);
    const images: StoredUserNote['images'] = Object.create(null);
    let renderedBytes = Buffer.byteLength(markdown);
    for (const [reference, path] of Object.entries(imagePaths)) {
      const image = await findImage(path);
      const mime = imageMime(path);
      images[reference] = { path, sha: image?.sha || null };
      if (!image || !mime) continue;
      let dataUrl = snapshot.assets[image.sha] || previous.assets[image.sha];
      if (!dataUrl) {
        try {
          dataUrl = `data:${mime};base64,${(await blob(image, MAX_USER_NOTE_IMAGE_BYTES)).toString('base64')}`;
        } catch {
          signal.throwIfAborted();
          continue; // Broken images must not hide an emergency notice's text.
        }
      }
      const bytes = Buffer.byteLength(dataUrl);
      if (renderedBytes + bytes > MAX_HTML_PREVIEW_BYTES / 2) continue;
      renderedBytes += bytes;
      if (!snapshot.assets[image.sha]) snapshotBytes += bytes;
      if (snapshotBytes > STORAGE_BUDGETS.auxiliary) throw new Error('User notes exceed the cache budget.');
      snapshot.assets[image.sha] = dataUrl;
    }
    const note = { id: entry.path, title, blobSha: entry.sha, markdown, images, revision: userNoteRevision(entry.sha, images) };
    snapshotBytes += Buffer.byteLength(JSON.stringify(note));
    if (snapshotBytes > STORAGE_BUDGETS.auxiliary) throw new Error('User notes exceed the cache budget.');
    snapshot.notes.push(note);
  }
  snapshot.checkedAt = Date.now();
  return snapshot;
}
