import { createHash } from 'node:crypto';
import { Marked } from 'marked';
import source from '../../src/shared/updateSource.json';
import {
  isUserNoteId,
  MAX_USER_NOTE_BYTES,
  MAX_USER_NOTE_IMAGES,
  resolveUserNoteImagePath,
  USER_NOTE_IMAGE_DATA_URL,
  USER_NOTES_FOLDER,
} from '../../src/shared/userNotes';

export const USER_NOTES_SOURCE = `${source.owner}/${source.repo}/${USER_NOTES_FOLDER}`;
export type StoredUserNote = {
  id: string;
  title: string;
  revision: string;
  blobSha: string;
  markdown: string;
  images: Record<string, { path: string; sha: string | null }>;
};
export type UserNotesSnapshot = {
  version: 1;
  source: string;
  checkedAt: number;
  notes: StoredUserNote[];
  assets: Record<string, string>;
};
export type UserNotesAcknowledgements = { version: 1; source: string; revisions: Record<string, string> };
export const emptyUserNotesSnapshot = (): UserNotesSnapshot => ({ version: 1, source: USER_NOTES_SOURCE, checkedAt: 0, notes: [], assets: {} });
export const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const isBlobSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const isRevision = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const parser = new Marked({ gfm: true });

export function parseUserNote(markdown: string, id: string): { title: string; imagePaths: Record<string, string> } {
  const tokens = parser.lexer(markdown);
  const heading = tokens.find((token) => token.type === 'heading' && token.depth === 1);
  const title = (heading && 'text' in heading ? heading.text : id.replace(/\.md$/i, ''))
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 500);
  const imagePaths: Record<string, string> = Object.create(null);
  const add = (reference: string) => {
    const path = resolveUserNoteImagePath(reference);
    if (path) imagePaths[reference] = path;
  };
  parser.walkTokens(tokens, (token) => {
    if (token.type === 'image') add(token.href);
    if (token.type === 'html') {
      for (const match of token.text.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) add(match[1] ?? match[2] ?? match[3]);
    }
  });
  if (Object.keys(imagePaths).length > MAX_USER_NOTE_IMAGES) throw new Error('Too many images in a user note.');
  return { title: title || id, imagePaths };
}

export function userNoteRevision(blobSha: string, images: StoredUserNote['images']): string {
  return createHash('sha256')
    .update(JSON.stringify([blobSha, Object.entries(images).sort(([a], [b]) => a.localeCompare(b))]))
    .digest('hex');
}

export function isUserNotesSnapshot(value: unknown): value is UserNotesSnapshot {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.source !== USER_NOTES_SOURCE ||
    !Number.isFinite(value.checkedAt) ||
    !Array.isArray(value.notes) ||
    !isRecord(value.assets)
  )
    return false;
  const ids = new Set<string>();
  for (const note of value.notes) {
    if (
      !isRecord(note) ||
      !isUserNoteId(note.id) ||
      ids.has(note.id) ||
      typeof note.title !== 'string' ||
      !isRevision(note.revision) ||
      !isBlobSha(note.blobSha) ||
      typeof note.markdown !== 'string' ||
      Buffer.byteLength(note.markdown) > MAX_USER_NOTE_BYTES ||
      !isRecord(note.images)
    )
      return false;
    ids.add(note.id);
    if (Object.keys(note.images).length > MAX_USER_NOTE_IMAGES) return false;
    for (const [reference, image] of Object.entries(note.images)) {
      if (
        !isRecord(image) ||
        typeof image.path !== 'string' ||
        resolveUserNoteImagePath(reference) !== image.path ||
        (image.sha !== null && !isBlobSha(image.sha))
      )
        return false;
    }
    if (note.revision !== userNoteRevision(note.blobSha, note.images as StoredUserNote['images'])) return false;
  }
  return Object.entries(value.assets).every(([sha, data]) => isBlobSha(sha) && typeof data === 'string' && USER_NOTE_IMAGE_DATA_URL.test(data));
}

export function isUserNotesAcknowledgements(value: unknown): value is UserNotesAcknowledgements {
  return (
    isRecord(value) &&
    value.version === 1 &&
    value.source === USER_NOTES_SOURCE &&
    isRecord(value.revisions) &&
    Object.entries(value.revisions).every(([id, revision]) => isUserNoteId(id) && isRevision(revision))
  );
}
