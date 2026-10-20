import { createHash } from 'node:crypto';
import { emptyUserNotesSnapshot, userNoteRevision, type StoredUserNote, type UserNotesSnapshot } from '../userNotesModel';

export function gitBlob(bytes: Buffer | string) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const sha = createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
  return { sha, encoding: 'base64', content: buffer.toString('base64'), size: buffer.length };
}

export function storedNote(id = '2026-10-20-info.md', markdown = '# Notice\nSaved information', images: StoredUserNote['images'] = {}): StoredUserNote {
  const blobSha = gitBlob(markdown).sha;
  return { id, markdown, title: markdown.split('\n')[0].replace(/^# /, ''), blobSha, images, revision: userNoteRevision(blobSha, images) };
}

export const notesSnapshot = (notes: StoredUserNote[], assets: Record<string, string> = {}): UserNotesSnapshot => ({
  ...emptyUserNotesSnapshot(),
  checkedAt: Date.now(),
  notes,
  assets,
});
